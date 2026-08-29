/**
 * Vitals panel controller: heart rate, NIBP (non-invasive blood pressure with
 * press-to-recycle), and SpO2. Values are lightly coupled to the active rhythm
 * so a shockable/perfusing distinction can be introduced later without
 * touching the UI.
 */

/** Duration of a simulated NIBP measurement cycle, in seconds. */
const NIBP_CYCLE_SEC = 3.5;

export class Vitals {
  /**
   * @param {Object} refs                       DOM element references.
   * @param {HTMLElement} refs.hr               Heart-rate value element.
   * @param {HTMLElement} refs.bp               NIBP value element.
   * @param {HTMLElement} refs.bpNote           NIBP sub-label element.
   * @param {HTMLElement} refs.spo2             SpO2 value element.
   */
  constructor(refs) {
    this.refs = refs;
    this.baseline = { sys: 122, dia: 78, spo2: 98 };
    this.reading = { ...this.baseline };
    this.measuring = false;
    this.measureElapsed = 0;
    this.sinceLast = 0;
    this.manual = null;
  }

  /**
   * Adopt a rhythm's baseline vitals and reflect them immediately, so a
   * non-perfusing rhythm (sys = 0) shows "--/--" without waiting for a recycle.
   */
  setBaseline(vitals) {
    this.manual = null;
    const merged = { ...this.baseline, ...vitals };
    // Rhythms may supply raw randomized floats; keep displayed vitals integral.
    this.baseline = {
      sys: Math.round(merged.sys),
      dia: Math.round(merged.dia),
      spo2: Math.round(merged.spo2),
    };
    this.reading = { ...this.baseline };
    this.sinceLast = 0;
    this.measuring = false;
  }

  /** Override monitor-displayed vitals until clearManual() is called. */
  setManual(vitals) {
    this.manual = { ...vitals };
    this.reading = {
      sys: Math.max(0, Math.round(vitals.sys)),
      dia: Math.max(0, Math.round(vitals.dia)),
      spo2: Math.max(0, Math.min(100, Math.round(vitals.spo2))),
    };
    this.measuring = false;
    this.sinceLast = 0;
  }

  clearManual() {
    this.manual = null;
    this.setBaseline(this.baseline);
  }

  getHeartRate(fallback) {
    return this.manual?.hr ?? fallback;
  }

  /** Kick off an NIBP measurement cycle (press-to-recycle). */
  recycle() {
    if (this.measuring) return;
    this.measuring = true;
    this.measureElapsed = 0;
  }

  /** Round-with-jitter helper for a fresh cuff reading (0 stays 0). */
  _sample(base, spread) {
    if (base <= 0) return 0;
    return Math.round(base + (Math.random() * 2 - 1) * spread);
  }

  /**
   * Advance vitals state.
   * @param {number} dt   Elapsed real time since last update, in seconds.
   * @param {number} hr   Current heart rate in bpm (from the ECG engine).
   */
  update(dt, hr) {
    this.sinceLast += dt;

    if (this.measuring) {
      this.measureElapsed += dt;
      if (this.measureElapsed >= NIBP_CYCLE_SEC) {
        this.measuring = false;
        this.reading = {
          sys: this._sample(this.baseline.sys, 6),
          dia: this._sample(this.baseline.dia, 4),
          spo2: this.baseline.spo2,
        };
        this.sinceLast = 0;
      }
    }

    // Heart rate.
    const displayHr = this.manual?.hr ?? hr;
    this.refs.hr.textContent = displayHr > 0 ? String(displayHr) : "--";

    // NIBP.
    if (this.measuring) {
      const dots = ".".repeat(1 + (Math.floor(this.measureElapsed * 3) % 3));
      this.refs.bp.textContent = dots;
      this.refs.bpNote.textContent = "measuring";
    } else if (this.reading.sys <= 0) {
      this.refs.bp.textContent = "--/--";
      this.refs.bpNote.textContent = "non-perfusing";
    } else {
      this.refs.bp.textContent = `${this.reading.sys}/${this.reading.dia}`;
      const map = Math.round(
        this.reading.dia + (this.reading.sys - this.reading.dia) / 3,
      );
      const mins = Math.floor(this.sinceLast / 60);
      const secs = Math.floor(this.sinceLast % 60);
      const ago = mins > 0 ? `${mins}m${secs}s ago` : `${secs}s ago`;
      this.refs.bpNote.textContent = `MAP ${map} · ${ago}`;
    }

    // SpO2.
    this.refs.spo2.textContent =
      this.reading.spo2 > 0 ? String(this.reading.spo2) : "--";
  }
}
