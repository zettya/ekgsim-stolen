/**
 * Third-Degree (Complete) AV Block.
 *
 * AV dissociation: the atria and ventricles beat on two entirely independent
 * clocks. Regular P waves march at an atrial (sinus) rate, unrelated to a
 * slow regular escape QRS rate — the P waves drift through the QRS/T complex
 * over time since neither clock is locked to the other. Symptomatic
 * bradycardia (slow, wide escape rhythm, low-normal perfusion).
 */

import { jitterBeat } from "../waveform.js";
import { randRange } from "./util.js";

/**
 * Lone P wave morphology (no QRS follows it — AV dissociation). Sized like a
 * real sinus P so the dissociated atrial rhythm clearly MARCHES across the
 * trace — the whole teaching point of complete block. It still stays well below
 * the tall escape R's detection threshold, so even when a P drifts onto an
 * escape T the sum is never miscounted as a ventricular beat.
 */
const P_WAVE = [{ name: "P", offset: 0, amp: 0.15, sigma: 0.025 }];

/**
 * Wide idioventricular escape complex (no antecedent P). The R is tall (raising
 * the peak-detection threshold) and the T deliberately modest, so a coincident
 * marching P summed onto the T stays comfortably below threshold.
 */
const ESCAPE_BEAT = [
  { name: "Q", offset: -0.03, amp: -0.14, sigma: 0.018 },
  { name: "R", offset: 0.0, amp: 1.25, sigma: 0.032 },
  { name: "S", offset: 0.04, amp: -0.34, sigma: 0.022 },
  { name: "T", offset: 0.28, amp: 0.2, sigma: 0.08 },
];

/**
 * @param {Object} [opts]
 * @param {number} [opts.atrialRate]  Sinus (P-wave) rate in bpm (default: random 75-100).
 * @param {number} [opts.ventRate]    Ventricular escape rate in bpm (default: random 30-45).
 * @returns {import("../rhythm.js").Rhythm}
 */
export function createCHB(opts = {}) {
  const atrialRate = opts.atrialRate ?? randRange(75, 100);
  const ventRate = opts.ventRate ?? randRange(30, 45);
  const meanPP = 60 / atrialRate;
  const meanVV = 60 / ventRate;

  // Two independent clocks — atria and ventricles are dissociated.
  let nextP = 0;
  let nextV = randRange(0, meanVV); // random phase so P and QRS start unlocked

  return {
    name: "Third-Degree (Complete) AV Block",
    label: "CHB",
    vitals: { sys: randRange(85, 95), dia: randRange(55, 65), spo2: randRange(93, 96) },
    nextBeat() {
      if (nextP <= nextV) {
        const tR = nextP;
        nextP += meanPP * (1 + (Math.random() * 2 - 1) * 0.02);
        return { tR, waves: jitterBeat(P_WAVE), isVentricular: false };
      }
      const tR = nextV;
      nextV += meanVV * (1 + (Math.random() * 2 - 1) * 0.02);
      return { tR, waves: jitterBeat(ESCAPE_BEAT) };
    },
  };
}
