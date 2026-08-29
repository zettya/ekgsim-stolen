/**
 * Sinus Bradycardia (SB).
 *
 * Normal sinus morphology (upright P, narrow QRS, upright T, normal PR
 * interval) but a slow, regular ventricular rate. Perfusing, low-normal
 * vitals reflecting reduced cardiac output at a slower rate — not a
 * hemodynamically unstable rhythm.
 */

import { NORMAL_BEAT, jitterBeat } from "../waveform.js";
import { randRange, ratePerfusion } from "./util.js";

/**
 * Create a Sinus Bradycardia rhythm generator.
 *
 * Identical in morphology and construction to normal sinus rhythm — the only
 * difference is a slower rate (40-58 bpm) with a small, regular respiratory
 * sinus arrhythmia (RSA) so the rate stays tightly regular (rrCV < 0.09).
 *
 * @param {Object} [opts]
 * @param {number} [opts.rate]  Ventricular (sinus) rate in bpm (default: random 40-58).
 * @returns {import("../rhythm.js").Rhythm}
 */
export function createSinusBrady(opts = {}) {
  const rate = opts.rate ?? randRange(40, 58);
  const meanRR = 60 / rate;
  const perf = ratePerfusion(rate);
  let lastR = null;
  let phase = Math.random() * Math.PI * 2;

  return {
    name: "Sinus Bradycardia",
    label: "SB",
    // Slow rate → reduced cardiac output, so pressure sits a touch below normal
    // (perfusion factor tapers with the bradycardic rate).
    vitals: {
      sys: randRange(108, 122) * perf,
      dia: randRange(66, 78) * perf,
      spo2: randRange(96, 98),
    },
    nextBeat() {
      if (lastR === null) {
        lastR = 0;
      } else {
        // Small RSA — keep it tighter than NSR so the rhythm reads regular.
        phase += (2 * Math.PI * meanRR) / 4;
        lastR += meanRR * (1 + 0.02 * Math.sin(phase)) * (1 + (Math.random() * 2 - 1) * 0.015);
      }
      return { tR: lastR, waves: jitterBeat(NORMAL_BEAT) };
    },
  };
}
