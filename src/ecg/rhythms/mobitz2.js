/**
 * Second-Degree AV Block, Mobitz Type II.
 *
 * The atria fire regularly and the PR interval on every conducted beat is
 * CONSTANT — there is no progressive PR prolongation. Instead, conduction fails
 * suddenly and intermittently: at a fixed ratio (e.g. 3:1 or 4:1) one P wave in
 * every cycle is blocked at the AV node and is NOT followed by a QRS. The result
 * is a periodic long pause (~2x the normal RR interval) with an isolated,
 * non-conducted P wave sitting in it. The presence of a constant PR (rather than
 * a lengthening one before the drop) is what distinguishes this from Mobitz I
 * (Wenckebach).
 */

import { NORMAL_BEAT, jitterBeat } from "../waveform.js";
import { randRange, choice } from "./util.js";

/** Non-conducted / lone P wave morphology (isolated atrial depolarization). */
const P_WAVE = NORMAL_BEAT.filter((w) => w.name === "P");

/** Conducted QRST complex delivered PR seconds after its P wave (no P here). */
const QRST = NORMAL_BEAT.filter((w) => w.name !== "P");

/**
 * Build a Mobitz II (Second-Degree AV Block, Type II) rhythm generator.
 *
 * Uses the beat-queue pattern: each atrial cycle pushes its beats in strict time
 * order (P first, then — if conducted — the QRST at tP + PR), guaranteeing a
 * monotonic non-decreasing tR across successive nextBeat() calls.
 *
 * @param {Object} [opts]
 * @param {number} [opts.atrialRate]  Regular sinus (P-wave) rate in bpm (default: random 60-95).
 * @param {number} [opts.pr]          Constant PR interval in seconds (default: random ~0.18).
 * @param {number} [opts.ratio]       Conduction ratio N: every N-th P is dropped (default: 3 or 4).
 * @returns {import("../rhythm.js").Rhythm}
 */
export function createMobitz2(opts = {}) {
  const atrialRate = opts.atrialRate ?? randRange(60, 95);
  const pr = opts.pr ?? randRange(0.16, 0.2); // CONSTANT for the life of this rhythm
  const ratio = opts.ratio ?? choice([3, 4]);
  const meanPP = 60 / atrialRate;

  // Conducted ventricular rate follows directly from the drop ratio.
  const ventRate = (atrialRate * (ratio - 1)) / ratio;

  let tP = 0; // atrial time cursor (time of the next P wave)
  let beatIndex = 0; // counts P waves; every ratio-th one is dropped
  /** @type {import("../rhythm.js").Beat[]} */
  const queue = [];

  return {
    name: "Second-Degree AV Block, Mobitz II",
    label: "MOB2",
    vitals: {
      sys: Math.round(randRange(105, 120)),
      dia: Math.round(randRange(65, 78)),
      spo2: Math.round(randRange(95, 98)),
    },
    nextBeat() {
      if (queue.length === 0) {
        beatIndex += 1;
        const isDropped = beatIndex % ratio === 0;

        // Regular atrial rhythm with only tiny physiologic variation.
        const thisP = tP;
        tP += meanPP * (1 + (Math.random() * 2 - 1) * 0.02);

        // The P wave itself is atrial-only; it must not count toward HR.
        queue.push({ tR: thisP, waves: jitterBeat(P_WAVE), isVentricular: false });

        if (!isDropped) {
          // Conducted beat: QRST fires exactly PR seconds after the P — CONSTANT.
          queue.push({ tR: thisP + pr, waves: jitterBeat(QRST), isVentricular: true });
        }
      }
      return queue.shift();
    },
    // Exposed for verification/inspection; not part of the core contract.
    ventRate,
  };
}
