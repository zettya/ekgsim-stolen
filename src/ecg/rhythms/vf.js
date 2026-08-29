/**
 * Ventricular Fibrillation (VF).
 *
 * Chaotic, disorganized electrical activity with no discrete QRS complexes —
 * a coarse, ever-changing undulating waveform. There is no coordinated
 * ventricular contraction, so this rhythm is pulseless / non-perfusing.
 */

import { jitterBeat } from "../waveform.js";
import { randRange } from "./util.js";

/**
 * @param {Object} [opts]
 * @param {number} [opts.minInterval]  Minimum pseudo-beat interval in seconds
 *   (default 0.10).
 * @param {number} [opts.maxInterval]  Maximum pseudo-beat interval in seconds
 *   (default 0.26).
 * @returns {import("../rhythm.js").Rhythm}
 */
export function createVF(opts = {}) {
  const minInterval = opts.minInterval ?? 0.1;
  const maxInterval = opts.maxInterval ?? 0.26;
  // Coarse VF has large, easily-defibrillated deflections; fine VF is
  // low-amplitude and can mimic asystole. Pick one at random each time.
  const coarse = opts.coarse ?? Math.random() < 0.6;
  const ampLo = coarse ? 0.35 : 0.1;
  const ampHi = coarse ? 0.85 : 0.28;
  let lastR = null;

  return {
    name: `Ventricular Fibrillation (${coarse ? "Coarse" : "Fine"})`,
    label: "VF",
    vitals: { sys: 0, dia: 0, spo2: 0 },
    nextBeat() {
      if (lastR === null) {
        lastR = 0;
      } else {
        lastR += randRange(minInterval, maxInterval);
      }
      const amp = randRange(ampLo, ampHi) * (Math.random() < 0.5 ? -1 : 1);
      const sigma = randRange(0.03, 0.08);
      const waves = jitterBeat([{ name: "F", offset: 0, amp, sigma }]);
      return { tR: lastR, waves, isVentricular: false };
    },
  };
}
