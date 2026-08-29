/**
 * Rhythm engine.
 *
 * A *rhythm* is a stateful generator that emits scheduled beats onto a single
 * shared cardiac timeline. The engine holds a rolling window of recent/upcoming
 * beats and can sample the resulting signal for any lead at any time. Heart
 * rate is derived from the *actual* scheduled R-R intervals, not assumed — so
 * an irregular rhythm reports an irregular rate for free.
 *
 * New rhythms (AFib, VT, blocks, PVCs, ...) implement the same tiny interface:
 *   { name, label, vitals, nextBeat(): Beat }
 * where Beat = { tR: number (seconds), waves: Wave[] }.
 */

import { BEAT_SUPPORT, evalWave } from "./waveform.js";
import { leadGain } from "./leads.js";

/**
 * Shared baseline artifact at a single instant, computed once per timestamp and
 * reused across every lead so all lanes show the SAME patient's respiration and
 * noise rather than uncorrelated per-lane RNG. The wander is a slow two-tone
 * respiratory sway; the noise is a single white sample. Both are scaled per lead
 * at the sampling site, so a lead that "sees" less signal also sees less sway.
 * @typedef {Object} Artifact
 * @property {number} wander  Respiratory baseline offset in mV (Lead II scale).
 * @property {number} noise   White-noise sample in mV (Lead II scale).
 */

/**
 * @typedef {Object} Beat
 * @property {number} tR       Absolute time of the R-peak (or wave center), in seconds.
 * @property {import("./waveform.js").Wave[]} waves  Beat morphology (Lead II ref).
 * @property {boolean} [isVentricular]  Whether this beat contains a QRS and
 *           should count toward heart rate. Defaults to true. Set false for
 *           atrial-only (P-wave) beats, e.g. the marching P's of complete
 *           heart block, so they don't inflate the displayed rate.
 */

/**
 * The contract every rhythm generator implements. A generator is stateful:
 * each `nextBeat()` call advances an internal clock and returns the next beat
 * on the shared timeline.
 *
 * @typedef {Object} Rhythm
 * @property {string} name    Full clinical name (shown on the monitor).
 * @property {string} label   Short label (e.g. "AF", "VT").
 * @property {{sys:number, dia:number, spo2:number}} vitals  Baseline vitals;
 *           set sys/dia to 0 for a non-perfusing rhythm (VF/asystole/PEA).
 * @property {function(): Beat} nextBeat  Emit the next scheduled beat.
 */

/**
 * The sampling engine: schedules beats on demand and samples any lead.
 */
export class EcgEngine {
  /**
   * @param {{name: string, label: string, vitals: Object, nextBeat: function(): Beat}} rhythm
   */
  constructor(rhythm) {
    /** @type {Beat[]} */
    this.beats = [];
    /**
     * Persistent history of scheduled R-peak times, independent of beat
     * pruning, so heart rate stays computable from recent R-R intervals.
     * @type {number[]}
     */
    this.rHistory = [];
    /** Timestamp of the cached baseline artifact (see {@link _artifactAt}). */
    this._artT = NaN;
    /** @type {Artifact} Cached artifact for `_artT`. */
    this._art = { wander: 0, noise: 0 };
    this.setRhythm(rhythm);
  }

  /**
   * Swap the active rhythm, preserving timeline continuity.
   * @param {{name: string, label: string, vitals: Object, nextBeat: function(): Beat}} rhythm
   */
  setRhythm(rhythm) {
    this.rhythm = rhythm;
    // Keep already-scheduled beats so the trace doesn't jump; future beats
    // come from the new rhythm.
  }

  /**
   * Clear all scheduled beats and R-peak history. Used when switching rhythms
   * so the new generator lays down its own timeline from the current instant
   * instead of inheriting the previous rhythm's beats.
   */
  reset() {
    this.beats = [];
    this.rHistory = [];
  }

  /**
   * Ensure beats are scheduled far enough ahead of time `t`, and prune stale
   * ones behind it.
   * @param {number} t  Current timeline position, in seconds.
   */
  _ensure(t) {
    const horizon = t + BEAT_SUPPORT;
    let guard = 0;
    while (
      (this.beats.length === 0 ||
        this.beats[this.beats.length - 1].tR < horizon) &&
      guard++ < 64
    ) {
      const beat = this.rhythm.nextBeat();
      this.beats.push(beat);
      // Only ventricular (QRS-bearing) beats count toward heart rate.
      if (beat.isVentricular !== false) {
        this.rHistory.push(beat.tR);
        if (this.rHistory.length > 32) this.rHistory.shift();
      }
    }
    // Drop beats whose influence has fully passed.
    while (this.beats.length > 1 && this.beats[0].tR < t - BEAT_SUPPORT) {
      this.beats.shift();
    }
  }

  /**
   * The shared baseline artifact at time `t`. Recomputed only when `t` changes,
   * so consecutive lead samples at the same instant reuse one realization and
   * the lanes stay correlated (one patient, many leads). Subtle, but it kills
   * the "drawn by a machine" flatness between complexes.
   * @param {number} t  Time, in seconds.
   * @returns {Artifact}
   */
  _artifactAt(t) {
    if (t !== this._artT) {
      this._artT = t;
      // Two slow respiratory tones (~0.25 and ~0.13 Hz) beat against each other
      // for a non-repeating sway; a single white sample rides on top.
      const wander =
        0.02 * Math.sin(2 * Math.PI * 0.25 * t) +
        0.012 * Math.sin(2 * Math.PI * 0.13 * t + 1.3);
      const noise = (Math.random() * 2 - 1) * 0.006;
      this._art = { wander, noise };
    }
    return this._art;
  }

  /**
   * Sample the signal for one lead at time `t`.
   *
   * @param {number} t                                        Time, in seconds.
   * @param {{label: string, coef: Object}} lead              Lead profile.
   * @returns {number}                                        Signal in mV.
   */
  sample(t, lead) {
    this._ensure(t);
    // Shared baseline artifact, scaled by how strongly this lead sees the heart
    // (its R-wave gain), so respiration and noise track the lead's amplitude.
    const art = this._artifactAt(t);
    const leadScale = Math.abs(leadGain(lead, "R"));
    let v = (art.wander + art.noise) * leadScale;

    for (const beat of this.beats) {
      const dt = t - beat.tR;
      if (dt < -BEAT_SUPPORT || dt > BEAT_SUPPORT) continue;
      for (const w of beat.waves) {
        v += evalWave(w, dt) * leadGain(lead, w.name);
      }
    }
    return v;
  }

  /**
   * Instantaneous heart rate from recent R-R intervals up to time `t`.
   *
   * @param {number} t  Current timeline position, in seconds.
   * @returns {number}  Heart rate in bpm (0 if not enough beats yet).
   */
  heartRate(t) {
    const past = this.rHistory.filter((tr) => tr <= t + 0.02);
    if (past.length < 2) return 0;
    const recent = past.slice(-5);
    let sum = 0;
    let n = 0;
    for (let i = 1; i < recent.length; i++) {
      sum += recent[i] - recent[i - 1];
      n++;
    }
    if (n === 0) return 0;
    return Math.round(60 / (sum / n));
  }
}
