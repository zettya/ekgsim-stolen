/**
 * Monitor + defibrillator audio.
 *
 * QRS tone: a short synthesized "ping" on every beat, like a real bedside
 * monitor. Pitch tracks SpO2 (higher saturation → higher pitch). Built from a
 * fundamental plus a soft second harmonic and a tiny percussive click at
 * onset, which is what separates a real monitor's tone from a bare sine
 * beep — most clinical monitors are not pure tones.
 *
 * Alarms: real monitors have an audible component, not just a banner —
 * repeating triplets for a critical alarm, a softer double-beep for a
 * warning. Both are throttled so they don't retrigger every frame.
 *
 * Defibrillator: a rising charge whine (capacitor charging), a sharp
 * discharge thump (shock delivery), and a two-tone caution beep (auto-disarm
 * on timeout) — modeled on how real defib/monitor units sound, not sampled
 * from any specific device.
 *
 * The AudioContext can only start after a user gesture (browser autoplay
 * policy). QRS/alarm tones stay gated behind the SOUND toggle; defib tones
 * play regardless once armed, mirroring how a real unit's charge/shock tones
 * are independent of the monitor's mute state — but the same lazily-created
 * context is reused for both.
 */

export class MonitorAudio {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.enabled = false;
    this.alarmEnabled = false;
    this.defibEnabled = true;
    this._lastCrit = -Infinity;
    this._lastWarn = -Infinity;
    /** @type {{osc: OscillatorNode, gain: GainNode}|null} */
    this._charge = null;
  }

  /** Lazily create/resume the shared AudioContext (needs a user gesture). */
  ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  /**
   * Toggle the monitor's QRS/alarm sound. Lazily creates/resumes the
   * AudioContext on first enable (must be called from a user gesture handler).
   * @returns {boolean} The new enabled state.
   */
  toggle() {
    if (!this.enabled) {
      this.ensureContext();
      this.enabled = true;
    } else {
      this.enabled = false;
      this.alarmEnabled = false;
    }
    if (this.enabled) this.alarmEnabled = true;
    return this.enabled;
  }

  /** Toggle alarm audio independently of QRS audio. */
  toggleAlarms() {
    if (!this.alarmEnabled) this.ensureContext();
    this.alarmEnabled = !this.alarmEnabled;
    return this.alarmEnabled;
  }

  /** Toggle defibrillator audio independently of monitor sounds. */
  toggleDefib() {
    if (!this.defibEnabled) this.ensureContext();
    this.defibEnabled = !this.defibEnabled;
    if (!this.defibEnabled) this.stopChargeTone();
    return this.defibEnabled;
  }

  /**
   * Map a saturation value to a tone frequency (SpO2 80→100% ≈ 500→900 Hz).
   * @param {number} spo2
   * @returns {number} Frequency in Hz.
   */
  static freqForSpo2(spo2) {
    const s = Math.max(80, Math.min(100, spo2 || 98));
    return 500 + (s - 80) * 20;
  }

  /**
   * Emit one short QRS tone: fundamental + a quiet second harmonic, with a
   * hairline click at onset for a percussive, "electronic ping" attack
   * rather than a soft pure sine.
   * @param {number} [freq]      Tone frequency in Hz (default 880).
   * @param {number} [gainPeak]  Peak gain 0..1 (default 0.16).
   */
  beep(freq = 880, gainPeak = 0.16) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.value = 1;
    out.connect(this.ctx.destination);

    // Fundamental.
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(gainPeak, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + 0.09);

    // Quiet second harmonic — fills out the timbre so it reads as an
    // electronic monitor tone rather than a lab-tone sine.
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.value = freq * 2;
    gain2.gain.setValueAtTime(0, t);
    gain2.gain.linearRampToValueAtTime(gainPeak * 0.18, t + 0.002);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    osc2.connect(gain2).connect(out);
    osc2.start(t);
    osc2.stop(t + 0.05);

    // Hairline onset click (filtered noise burst) — the percussive "tick"
    // under the tone that real monitor beeps have and a bare sine lacks.
    const click = this._noiseBurst(t, 0.004, gainPeak * 0.25, 2400);
    click.connect(out);
  }

  /**
   * Build a short filtered-noise burst starting at `t`.
   * @param {number} t          Start time (AudioContext time).
   * @param {number} dur        Duration in seconds.
   * @param {number} peak       Peak gain.
   * @param {number} centerHz   Bandpass center frequency.
   * @returns {GainNode} The burst's output node — connect it and it plays.
   */
  _noiseBurst(t, dur, peak, centerHz) {
    const n = Math.max(1, Math.round(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = centerHz;
    bp.Q.value = 1.2;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(gain);
    src.start(t);
    src.stop(t + dur);
    return gain;
  }

  /**
   * Critical-alarm audio: a fast triplet of urgent high tones, throttled to
   * repeat roughly every 1.4s while the condition persists — matches the
   * "high-priority" pattern real monitors use (rapid repeating bursts), as
   * distinct from an occasional single beep.
   * @param {number} now  Current signal/monotonic time in seconds, used to throttle.
   */
  critAlarm(now) {
    if (!this.alarmEnabled || !this.ctx) return;
    if (now - this._lastCrit < 1.4) return;
    this._lastCrit = now;
    const t = this.ctx.currentTime;
    [0, 0.11, 0.22].forEach((off) => this._tone(t + off, 988, 0.09, 0.11, "square"));
  }

  /**
   * Warning-alarm audio: a softer double-beep, throttled to ~every 2.2s —
   * the "medium-priority" pattern (slower, gentler than critical).
   * @param {number} now
   */
  warnAlarm(now) {
    if (!this.alarmEnabled || !this.ctx) return;
    if (now - this._lastWarn < 2.2) return;
    this._lastWarn = now;
    const t = this.ctx.currentTime;
    [0, 0.16].forEach((off) => this._tone(t + off, 660, 0.09, 0.1, "sine"));
  }

  /** Small helper: one plain enveloped tone at time `t`. */
  _tone(t, freq, gainPeak, dur, type = "sine") {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(gainPeak, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // --- Defibrillator tones --------------------------------------------------
  // These use ensureContext() directly (not gated on `enabled`/SOUND), since
  // charge/shock/disarm tones are procedural safety feedback on a real unit,
  // independent of whether the bedside monitor's QRS beep is muted.

  /**
   * Start the rising capacitor-charging whine and ramp it over `durationSec`.
   * Call `stopChargeTone()` to cut it early (e.g. on disarm).
   * @param {number} durationSec
   */
  startChargeTone(durationSec) {
    if (!this.defibEnabled) return;
    this.ensureContext();
    this.stopChargeTone();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(640, t + durationSec);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + durationSec * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.09, t + durationSec);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    osc.connect(lp).connect(gain).connect(this.ctx.destination);
    osc.start(t);
    this._charge = { osc, gain };
  }

  /** Stop the charge whine, if playing, with a quick fade. */
  stopChargeTone() {
    if (!this._charge || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._charge.gain.gain.cancelScheduledValues(t);
    this._charge.gain.gain.setValueAtTime(this._charge.gain.gain.value, t);
    this._charge.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    this._charge.osc.stop(t + 0.1);
    this._charge = null;
  }

  /** A brief rising "ready" chirp once charging completes. */
  chargeReady() {
    this.stopChargeTone();
    if (!this.defibEnabled) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    this._tone(t, 1200, 0.08, 0.09, "sine");
    this._tone(t + 0.1, 1600, 0.08, 0.12, "sine");
  }

  /** Sharp discharge sound: a low thump plus a broadband crack — one shock. */
  dischargeShock() {
    this.stopChargeTone();
    if (!this.defibEnabled) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    // Low-frequency thump.
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.16);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.24);
    // Broadband crack on top.
    this._noiseBurst(t, 0.05, 0.3, 1800).connect(this.ctx.destination);
  }

  /** Two-tone descending caution beep — energy auto-disarmed on timeout. */
  disarmTone() {
    if (!this.defibEnabled) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    this._tone(t, 520, 0.08, 0.14, "square");
    this._tone(t + 0.18, 360, 0.08, 0.18, "square");
  }
}
