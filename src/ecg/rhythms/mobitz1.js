/**
 * Second-Degree AV Block, Mobitz Type I (Wenckebach).
 *
 * The atria fire regularly (constant P-P interval), but AV conduction fatigues:
 * the PR interval lengthens progressively on each successive conducted beat
 * until, on the Nth P wave, conduction fails entirely and the QRS is dropped.
 * The cycle then resets with a short PR. This produces characteristic "grouped
 * beating" — clusters of QRS complexes separated by a pause (~2x P-P) at each
 * non-conducted P. Because P waves are regular but only N-1 of every N conduct,
 * the ventricular rate is always below the atrial rate.
 */

import { NORMAL_BEAT, jitterBeat } from "../waveform.js";
import { randRange, choice } from "./util.js";

/** Lone P-wave morphology (a non-conducted atrial impulse — no QRS follows). */
const P_ONLY = NORMAL_BEAT.filter((w) => w.name === "P");

/** Conducted QRST complex without its own P (the P is emitted separately). */
const QRST = NORMAL_BEAT.filter((w) => w.name !== "P");

/**
 * Create a Mobitz I (Wenckebach) second-degree AV block generator.
 *
 * Implements the beat-queue pattern: each nextBeat() drains a queue built one
 * full Wenckebach cycle at a time. Within a cycle the first N-1 P waves each
 * conduct (P at tP, QRST at tP+PR with PR growing each beat), and the Nth P is
 * dropped (P only), yielding a pause before the next cluster.
 *
 * @param {Object} [opts] Optional overrides.
 * @param {number} [opts.atrialRate] Atrial (P-wave) rate in bpm. Default: random 60-90.
 * @param {number} [opts.cycleLen] Beats per Wenckebach group N (>=2). Default: random 3 or 4.
 * @param {number} [opts.prStart] Starting PR interval in seconds. Default: ~0.16.
 * @param {number} [opts.prStep] PR increment per conducted beat in seconds. Default: ~0.05.
 * @returns {import("../rhythm.js").Rhythm} The rhythm contract object.
 */
export function createMobitz1(opts = {}) {
  const atrialRate = opts.atrialRate ?? randRange(60, 90);
  const cycleLen = opts.cycleLen ?? choice([3, 4]);
  const prStart = opts.prStart ?? randRange(0.15, 0.18);
  const prStep = opts.prStep ?? randRange(0.04, 0.06);
  const meanPP = 60 / atrialRate;

  /** @type {Array<import("../rhythm.js").Beat>} */
  const queue = [];
  let tP = 0; // Atrial time cursor (seconds).

  /**
   * Build one full Wenckebach cycle and push its beats into the queue in
   * strict time order, guaranteeing monotonic tR across the queue boundary.
   * @returns {void}
   */
  function buildCycle() {
    for (let i = 0; i < cycleLen; i++) {
      // Non-conducted (isVentricular:false) P wave at the atrial cursor.
      queue.push({ tR: tP, waves: jitterBeat(P_ONLY), isVentricular: false });

      // The first N-1 P waves conduct with a progressively longer PR interval;
      // the Nth P is dropped (no QRS), producing the pause.
      if (i < cycleLen - 1) {
        const pr = prStart + i * prStep;
        queue.push({ tR: tP + pr, waves: jitterBeat(QRST), isVentricular: true });
      }

      // Advance the regular atrial cursor by one P-P interval.
      tP += meanPP * (1 + (Math.random() * 2 - 1) * 0.02);
    }
  }

  return {
    name: "Second-Degree AV Block, Mobitz I (Wenckebach)",
    label: "MOB1",
    vitals: { sys: randRange(108, 124), dia: randRange(68, 80), spo2: randRange(95, 98) },
    nextBeat() {
      if (queue.length === 0) buildCycle();
      return queue.shift();
    },
  };
}
