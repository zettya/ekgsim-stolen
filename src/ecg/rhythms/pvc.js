/**
 * Sinus Rhythm with Premature Ventricular Complexes (PVCs).
 *
 * An underlying regular sinus rhythm is interrupted by occasional premature
 * ventricular complexes: wide, bizarre beats with NO preceding P wave, a T wave
 * discordant to (opposite direction of) the main QRS deflection, occurring
 * EARLY, and followed by a full compensatory pause. Unifocal — every PVC shares
 * one fixed morphology and sign, chosen once per instance.
 */

import { NORMAL_BEAT, jitterBeat } from "../waveform.js";
import { randRange, chance } from "./util.js";

/**
 * Build one fixed unifocal PVC morphology: wide QRS, no P wave, and a T wave
 * discordant to the dominant QRS deflection.
 *
 * @param {number} sign  Dominant deflection sign (+1 upright, -1 inverted).
 * @returns {import("../waveform.js").Wave[]} The PVC's wave list.
 */
function makePvcBeat(sign) {
  return [
    { name: "R", offset: 0.0, amp: 1.4 * sign, sigma: 0.05 },
    { name: "S", offset: 0.07, amp: -0.4 * sign, sigma: 0.045 },
    { name: "T", offset: 0.33, amp: 0.5 * -sign, sigma: 0.09 },
  ];
}

/**
 * Create a Sinus Rhythm with PVCs generator.
 *
 * Uses the BEAT QUEUE pattern: sinus beats march at a regular RR interval; with
 * a per-beat probability a premature PVC is inserted early and the following
 * sinus beat is deferred to a full compensatory pause (2 * RR from the prior
 * sinus beat). Both events for a PVC cycle are pushed to the queue in time
 * order, so the shifted tR stays monotonically non-decreasing.
 *
 * @param {Object} [opts]
 * @param {number} [opts.rate]     Underlying sinus rate in bpm (default: random 65-90).
 * @param {number} [opts.pvcProb]  Per-beat probability of a PVC (default: random ~0.13).
 * @returns {import("../rhythm.js").Rhythm}
 */
export function createPVC(opts = {}) {
  const rate = opts.rate ?? randRange(65, 90);
  const RR = 60 / rate;
  const pvcProb = opts.pvcProb ?? randRange(0.11, 0.15);
  // Unifocal PVC, dominantly upright in Lead II so its premature R is
  // unambiguously detectable (and the discordant, inverted T is preserved).
  const PVC_BEAT = makePvcBeat(1);

  /** @type {import("../rhythm.js").Beat[]} */
  const queue = [];
  let lastSinus = null; // time (s) of the most recently scheduled sinus R

  return {
    name: "Sinus Rhythm with PVCs",
    label: "PVC",
    vitals: { sys: randRange(118, 130), dia: randRange(72, 82), spo2: randRange(96, 99) },
    nextBeat() {
      if (queue.length === 0) {
        if (lastSinus === null) {
          lastSinus = 0;
          queue.push({ tR: lastSinus, waves: jitterBeat(NORMAL_BEAT) });
        } else if (chance(pvcProb)) {
          // Premature ventricular complex fires early after the last sinus beat.
          const tPVC = lastSinus + randRange(0.5, 0.7) * RR;
          queue.push({ tR: tPVC, waves: jitterBeat(PVC_BEAT), isVentricular: true });
          // Full compensatory pause: next sinus lands two RR intervals out.
          lastSinus = lastSinus + 2 * RR;
          queue.push({ tR: lastSinus, waves: jitterBeat(NORMAL_BEAT) });
        } else {
          // Regular sinus beat with mild physiologic RR variation.
          lastSinus = lastSinus + RR * (1 + (Math.random() * 2 - 1) * 0.02);
          queue.push({ tR: lastSinus, waves: jitterBeat(NORMAL_BEAT) });
        }
      }
      return queue.shift();
    },
  };
}
