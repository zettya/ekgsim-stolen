/**
 * Defibrillator panel controller — energy selection, sync (cardioversion)
 * mode, charge/shock sequencing, and auto-disarm, wired to the shared
 * {@link MonitorAudio} for the charge whine / discharge / disarm tones.
 *
 * This module owns UI *state and sequencing* only (armed? charging?
 * charged? which energy? sync on/off?). It does not know about ECG rhythms —
 * the host (main.js) supplies `onShock(energy, syncOn)` and decides what the
 * shock *does* to the patient (successful defibrillation, induced VF from an
 * unsynchronized shock on a perfusing rhythm, "not indicated" on a
 * non-shockable rhythm, etc.), since that requires the engine/rhythm state
 * this module deliberately doesn't touch.
 *
 * Two things are deliberately real-device-accurate because they're the
 * actual teaching point of a defib interface, not just decoration:
 *   - SYNC mode will refuse to fire without a `hasOrganizedQrs` host say-so —
 *     real defibrillators cannot sync-lock onto VF/asystole/PEA/torsades.
 *   - The unit auto-disarms after an idle window, same as real units, so a
 *     charged-and-forgotten pad set doesn't sit hot indefinitely.
 */

const CHARGE_SEC = 2.2;
const AUTO_DISARM_SEC = 45;
const ENERGY_LEVELS = [100, 120, 150, 200, 300, 360];

export class DefibPanel {
  /**
   * @param {Object} refs
   * @param {NodeListOf<HTMLButtonElement>} refs.energyButtons
   * @param {HTMLButtonElement} refs.syncBtn
   * @param {HTMLButtonElement} refs.chargeBtn
   * @param {HTMLButtonElement} refs.shockBtn
   * @param {HTMLElement} refs.status       Short state readout ("READY", "CHARGING 54%", ...).
   * @param {HTMLElement} refs.message      Outcome/teaching message after a shock or a blocked attempt.
   * @param {HTMLElement} refs.flash        Full-screen flash overlay element, toggled on discharge.
   * @param {Object} opts
   * @param {import("./audio.js").MonitorAudio} opts.audio
   * @param {function(): boolean} opts.hasOrganizedQrs  Whether the current rhythm has a
   *   discrete QRS a sync circuit could lock to (false for VF/asystole/PEA/torsades).
   * @param {function(number, boolean): {message: string, kind: "ok"|"warn"|"bad"}} opts.onShock
   * @param {function(number, number, boolean): {message?: string, kind?: "ok"|"warn"|"bad"}|void} [opts.onPacing]
   *   Called once a shock is actually delivered, with (energyJoules, syncOn). Return
   *   the outcome to display.
   */
  constructor(refs, opts) {
    this.refs = refs;
    this.opts = opts;
    this.energy = 200;
    this.sync = false;
    /** @type {"idle"|"charging"|"charged"} */
    this.state = "idle";
    this._chargeStart = 0;
    this._chargeRaf = 0;
    this._disarmTimer = 0;
    this.pacing = false;

    for (const btn of refs.energyButtons) {
      btn.addEventListener("click", () => this.selectEnergy(Number(btn.dataset.energy)));
    }
    refs.syncBtn.addEventListener("click", () => this.toggleSync());
    refs.chargeBtn.addEventListener("click", () => this.charge());
    refs.shockBtn.addEventListener("click", () => this.shock());
    refs.disarmBtn?.addEventListener("click", () => this._disarm("manual disarm"));
    refs.paceBtn?.addEventListener("click", () => this.togglePacing());

    this._renderEnergy();
    this._renderSync();
    this._renderState();
    this._renderPacing();
  }

  /** @returns {number[]} The available energy presets, for reference/testing. */
  static get ENERGY_LEVELS() {
    return ENERGY_LEVELS;
  }

  selectEnergy(joules) {
    if (this.state !== "idle") return; // locked once charging/charged, like a real unit
    this.energy = joules;
    this._renderEnergy();
  }

  toggleSync() {
    if (this.state === "charged") this._disarm("Sync changed"); // re-arm required after mode change
    this.sync = !this.sync;
    this._renderSync();
  }

  /** Begin the charge sequence: locks energy/sync, ramps the whine, arms the paddles. */
  charge() {
    if (this.state !== "idle") return;
    this.state = "charging";
    this._chargeStart = performance.now();
    this.opts.audio.startChargeTone(CHARGE_SEC);
    this.refs.message.hidden = true;
    this._renderState();
    this._renderEnergy();
    this._renderSync();

    const tick = () => {
      const elapsed = (performance.now() - this._chargeStart) / 1000;
      if (this.state !== "charging") return; // aborted (e.g. sync toggled)
      if (elapsed >= CHARGE_SEC) {
        this.opts.audio.stopChargeTone();
        this.state = "charged";
        this.opts.audio.chargeReady();
        this._armDisarmTimer();
        this._renderState();
        return;
      }
      this._renderState(Math.round((elapsed / CHARGE_SEC) * 100));
      this._chargeRaf = requestAnimationFrame(tick);
    };
    this._chargeRaf = requestAnimationFrame(tick);
  }

  /** Deliver the shock, or refuse it (sync with no lockable QRS) and explain why. */
  shock() {
    if (this.state !== "charged") return;

    if (this.sync && !this.opts.hasOrganizedQrs()) {
      this.opts.audio.disarmTone();
      this._showMessage(
        "SYNC could not lock to a QRS — there's no organized complex to synchronize to. " +
          "Turn SYNC off before shocking a pulseless/disorganized rhythm.",
        "warn",
      );
      return; // stays charged — a real unit withholds the shock, doesn't disarm
    }

    clearTimeout(this._disarmTimer);
    this.opts.audio.stopChargeTone();
    this.opts.audio.dischargeShock();
    this._flash();
    const energy = this.energy;
    const sync = this.sync;
    this.state = "idle";
    this._renderState();
    this._renderEnergy();
    this._renderSync();

    const outcome = this.opts.onShock(energy, sync);
    if (outcome) this._showMessage(outcome.message, outcome.kind);
  }

  /** Abort a charge/charged state without shocking (used on sync toggle, or externally). */
  _disarm(reason) {
    cancelAnimationFrame(this._chargeRaf);
    clearTimeout(this._disarmTimer);
    this.opts.audio.stopChargeTone();
    if (this.state === "charged") this.opts.audio.disarmTone();
    this.state = "idle";
    this._renderState();
    this._renderEnergy();
    this._renderSync();
    if (reason) this._showMessage(`Disarmed — ${reason}. Recharge to try again.`, "warn");
  }

  /** Toggle transcutaneous pacing. The host decides whether electrical capture occurs. */
  togglePacing() {
    const rate = Number(this.refs.paceRate?.value ?? 70);
    const output = Number(this.refs.paceOutput?.value ?? 70);
    const requested = !this.pacing;
    const result = this.opts.onPacing?.(rate, output, requested);
    if (result?.accepted === false) {
      // Do not leave the UI showing PACING ON when the simulator correctly
      // rejects pacing for the current rhythm.
      this.pacing = false;
    } else {
      this.pacing = requested;
    }
    if (result?.message) this._showMessage(result.message, result.kind ?? "warn");
    this._renderPacing();
  }

  /** Auto-disarm after an idle window, same behavior as a real unit. */
  _armDisarmTimer() {
    clearTimeout(this._disarmTimer);
    this._disarmTimer = setTimeout(() => this._disarm("energy auto-disarmed after 45s idle"), AUTO_DISARM_SEC * 1000);
  }

  _renderPacing() {
    const btn = this.refs.paceBtn;
    if (!btn) return;
    btn.textContent = this.pacing ? "■ STOP PACING" : "▶ START PACING";
    btn.classList.toggle("armed", this.pacing);
    btn.setAttribute("aria-pressed", String(this.pacing));
    if (this.refs.paceStatus) {
      const rate = Number(this.refs.paceRate?.value ?? 70);
      const output = Number(this.refs.paceOutput?.value ?? 70);
      this.refs.paceStatus.textContent = this.pacing
        ? `PACING ON · ${rate} ppm · ${output} mA`
        : "PACING OFF";
    }
  }

  _flash() {
    const el = this.refs.flash;
    el.classList.remove("flashing");
    // Force reflow so re-adding the class restarts the animation.
    void el.offsetWidth;
    el.classList.add("flashing");
  }

  _showMessage(text, kind) {
    this.refs.message.hidden = false;
    this.refs.message.className = `defib-message ${kind}`;
    this.refs.message.textContent = text;
  }

  _renderEnergy() {
    for (const btn of this.refs.energyButtons) {
      btn.classList.toggle("active", Number(btn.dataset.energy) === this.energy);
      btn.disabled = this.state !== "idle";
    }
  }

  _renderSync() {
    this.refs.syncBtn.classList.toggle("active", this.sync);
    this.refs.syncBtn.setAttribute("aria-pressed", String(this.sync));
    this.refs.syncBtn.textContent = this.sync ? "SYNC ON" : "SYNC OFF";
  }

  _renderState(pct) {
    this.refs.chargeBtn.disabled = this.state !== "idle";
    this.refs.shockBtn.disabled = this.state !== "charged";
    if (this.refs.disarmBtn) this.refs.disarmBtn.disabled = this.state === "idle";
    this.refs.shockBtn.classList.toggle("armed", this.state === "charged");
    if (this.state === "idle") {
      this.refs.status.textContent = `READY · ${this.energy} J`;
      this.refs.status.className = "defib-status";
    } else if (this.state === "charging") {
      this.refs.status.textContent = `CHARGING ${this.energy} J · ${pct ?? 0}%`;
      this.refs.status.className = "defib-status charging";
    } else {
      this.refs.status.textContent = `CHARGED ${this.energy} J — CLEAR!`;
      this.refs.status.className = "defib-status charged";
    }
  }
}
