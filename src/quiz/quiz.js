/**
 * Practice / quiz mode controller — two steps per round.
 *
 *   1. Identify the rhythm (pick from the full library, grouped by family).
 *   2. Choose the ACLS intervention for the patient in front of you (pick from
 *      the treatment bank), reasoning from the scenario + on-screen vitals.
 *
 * Both steps reveal immediately with a rationale. Scoring tracks a rhythm
 * accuracy, a treatment accuracy, and a streak of rounds where BOTH were right.
 *
 * This module owns the answer banks and scoring only. The host (main.js) owns
 * the ECG engine and the ACLS layer: each round it installs a mystery rhythm +
 * scenario and returns the round facts via the `onNewRound` callback.
 */

import { RHYTHMS, FAMILY_ORDER } from "../ecg/rhythms/index.js";
import { TREATMENTS, TREATMENT_GROUPS } from "./acls.js";

export class Quiz {
  /**
   * @param {Object} refs                    DOM references.
   * @param {HTMLElement} refs.prompt        Current-step prompt line.
   * @param {HTMLElement} refs.grid          Answer-bank container (rebuilt per step).
   * @param {HTMLElement} refs.revealRhythm  Rhythm reveal banner.
   * @param {HTMLElement} refs.revealTx      Treatment reveal banner.
   * @param {HTMLButtonElement} refs.next    "Next" button.
   * @param {HTMLElement} refs.streak        Current-streak value element.
   * @param {HTMLElement} refs.best          Best-streak value element.
   * @param {HTMLElement} refs.rhythmAcc     Rhythm-accuracy value element.
   * @param {HTMLElement} refs.txAcc         Treatment-accuracy value element.
   * @param {Object} cbs                     Callbacks.
   * @param {function(): {rhythmId: string, correctTxId: string,
   *   txRationale: string, scenarioPrompt: string}} cbs.onNewRound  Install a
   *   fresh mystery rhythm + scenario on the monitor and return the round facts.
   */
  constructor(refs, { onNewRound }) {
    this.refs = refs;
    this.onNewRound = onNewRound;
    /** @type {Map<string, HTMLButtonElement>} */
    this.buttons = new Map();
    this.phase = "rhythm"; // "rhythm" | "treatment"
    /** @type {?{rhythmId:string,correctTxId:string,txRationale:string,scenarioPrompt:string}} */
    this.round = null;
    this.rhythmRight = false;
    this.reset();
    this.refs.next.addEventListener("click", () => this.newRound());
  }

  /** Zero the running score and reflect it. */
  reset() {
    this.total = 0;
    this.rhythmCorrect = 0;
    this.txCorrect = 0;
    this.streak = 0;
    this.best = 0;
    this._renderScore();
  }

  /**
   * Build a family/group-grouped answer bank into the grid and wire clicks.
   * @param {"rhythm"|"treatment"} kind
   */
  _buildBank(kind) {
    const grid = this.refs.grid;
    grid.innerHTML = "";
    this.buttons.clear();

    const groups =
      kind === "rhythm"
        ? FAMILY_ORDER.map((fam) => ({
            cap: fam,
            items: RHYTHMS.filter((r) => r.family === fam).map((r) => ({ id: r.id, name: r.name })),
          }))
        : TREATMENT_GROUPS.map((g) => ({
            cap: g,
            items: Object.entries(TREATMENTS)
              .filter(([, t]) => t.group === g)
              .map(([id, t]) => ({ id, name: t.name })),
          }));

    for (const group of groups) {
      const col = document.createElement("div");
      col.className = "quiz-fam";
      const cap = document.createElement("div");
      cap.className = "quiz-fam-cap";
      cap.textContent = group.cap;
      col.appendChild(cap);
      for (const item of group.items) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "quiz-ans";
        b.textContent = item.name;
        b.dataset.id = item.id;
        b.addEventListener("click", () => this.guess(item.id));
        this.buttons.set(item.id, b);
        col.appendChild(b);
      }
      grid.appendChild(col);
    }
  }

  /** Start a fresh round at step 1 (identify the rhythm). */
  newRound() {
    this.refs.revealRhythm.hidden = true;
    this.refs.revealRhythm.className = "quiz-reveal";
    this.refs.revealTx.hidden = true;
    this.refs.revealTx.className = "quiz-reveal";
    this.refs.next.hidden = true;
    this.rhythmRight = false;

    this.round = this.onNewRound();
    this.phase = "rhythm";
    this.refs.prompt.textContent = "Identify the rhythm ↓";
    this._buildBank("rhythm");
  }

  /**
   * Handle a click in whichever bank is showing.
   * @param {string} id
   */
  guess(id) {
    if (!this.round) return;
    if (this.phase === "rhythm") this._answerRhythm(id);
    else this._answerTreatment(id);
  }

  /** Score the rhythm guess, reveal it, and advance to the treatment step. */
  _answerRhythm(id) {
    this.rhythmRight = id === this.round.rhythmId;
    for (const b of this.buttons.values()) b.disabled = true;
    this.buttons.get(this.round.rhythmId)?.classList.add("correct");
    if (!this.rhythmRight) this.buttons.get(id)?.classList.add("wrong");

    const entry = RHYTHMS.find((r) => r.id === this.round.rhythmId);
    this.refs.revealRhythm.hidden = false;
    this.refs.revealRhythm.className = `quiz-reveal ${this.rhythmRight ? "ok" : "no"}`;
    this.refs.revealRhythm.innerHTML =
      `<span class="quiz-verdict">${this.rhythmRight ? "✓ Rhythm" : "✗ Rhythm"}</span>` +
      `<span class="quiz-name">${entry.name}</span>` +
      `<span class="quiz-teach">${entry.teach}</span>`;

    this.phase = "treatment";
    this.refs.prompt.textContent = this.round.scenarioPrompt;
    this._buildBank("treatment");
  }

  /** Score the treatment guess, reveal it, tally the round, and offer Next. */
  _answerTreatment(id) {
    const txRight = id === this.round.correctTxId;
    for (const b of this.buttons.values()) b.disabled = true;
    this.buttons.get(this.round.correctTxId)?.classList.add("correct");
    if (!txRight) this.buttons.get(id)?.classList.add("wrong");

    this.total += 1;
    if (this.rhythmRight) this.rhythmCorrect += 1;
    if (txRight) this.txCorrect += 1;
    if (this.rhythmRight && txRight) {
      this.streak += 1;
      this.best = Math.max(this.best, this.streak);
    } else {
      this.streak = 0;
    }

    const tx = TREATMENTS[this.round.correctTxId];
    this.refs.revealTx.hidden = false;
    this.refs.revealTx.className = `quiz-reveal ${txRight ? "ok" : "no"}`;
    this.refs.revealTx.innerHTML =
      `<span class="quiz-verdict">${txRight ? "✓ Treatment" : "✗ Treatment"}</span>` +
      `<span class="quiz-name">${tx.name}</span>` +
      `<span class="quiz-teach">${this.round.txRationale}</span>`;

    this.refs.next.hidden = false;
    this._renderScore();
  }

  /** Reflect the current score in the scoreboard. */
  _renderScore() {
    this.refs.streak.textContent = String(this.streak);
    this.refs.best.textContent = String(this.best);
    const pct = (n) => (this.total ? Math.round((n / this.total) * 100) : 0);
    this.refs.rhythmAcc.textContent = `${pct(this.rhythmCorrect)}% (${this.rhythmCorrect}/${this.total})`;
    this.refs.txAcc.textContent = `${pct(this.txCorrect)}% (${this.txCorrect}/${this.total})`;
  }
}
