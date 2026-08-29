/**
 * Idioventricular Rhythm (IVR) / Accelerated Idioventricular Rhythm (AIVR).
 *
 * A ventricular escape rhythm: no organized atrial activity reaches the
 * ventricles (no P wave), so a ventricular focus paces the heart on its own,
 * producing a wide, bizarre monomorphic QRS with discordant T-wave
 * repolarization — the same morphology family as VT, but slower and
 * perfectly regular. True idioventricular rhythm (20-40 bpm) is a poorly
 * perfusing escape rhythm; accelerated idioventricular rhythm (AIVR,
 * 40-100 bpm) is typically better tolerated. One band is chosen at random
 * per instance.
 */

import { jitterBeat } from "../waveform.js";
import { randRange, chance } from "./util.js";

/**
 * Build an Idioventricular Rhythm generator (classic IVR or AIVR).
 *
 * @param {Object} [opts]
 * @param {number} [opts.rate] Ventricular rate in bpm (default: random pick
 *   of either the classic idioventricular band 20-40 bpm or the accelerated
 *   band 45-95 bpm).
 * @returns {import("../rhythm.js").Rhythm} A stateful IVR rhythm.
 */
export function createIVR(opts = {}) {
  const isAccelerated = chance(0.5);
  const rate = opts.rate ?? (isAccelerated ? randRange(45, 95) : randRange(20, 40));
  const meanRR = 60 / rate;

  // Wide monophasic complex like VT but slower. Dominant QRS upright in the
  // monitored Lead II; small opposite pre-deflection; T wave discordant
  // (opposite polarity to the QRS, offset well past the R peak).
  const rAmp = randRange(1.1, 1.5);
  const rSigma = randRange(0.045, 0.06);
  const tAmp = -randRange(0.3, 0.4);
  const tOffset = randRange(0.26, 0.3);

  /** @type {import("../waveform.js").Wave[]} */
  const ivrBeat = [
    // Small opposite pre-deflection, exaggerating the bizarre wide onset.
    { name: "Q", offset: -0.03, amp: -randRange(0.1, 0.2), sigma: 0.02 },
    // Wide, monophasic R (the wide, bizarre ventricular escape complex).
    { name: "R", offset: 0.0, amp: rAmp, sigma: rSigma },
    // Discordant T wave, opposite polarity to the QRS.
    { name: "T", offset: tOffset, amp: tAmp, sigma: 0.07 },
  ];

  let lastR = null;

  // Perfusion scales with rate: classic (slow) IVR is poorly perfusing near
  // the low end of the vitals band; AIVR runs toward the higher end.
  const perfFrac = isAccelerated ? randRange(0.5, 1) : randRange(0, 0.5);

  return {
    name: isAccelerated ? "Accelerated Idioventricular Rhythm" : "Idioventricular Rhythm",
    label: isAccelerated ? "AIVR" : "IVR",
    vitals: {
      sys: Math.round(78 + perfFrac * (100 - 78)),
      dia: Math.round(50 + perfFrac * (66 - 50)),
      spo2: Math.round(88 + perfFrac * (95 - 88)),
    },
    nextBeat() {
      if (lastR === null) {
        lastR = 0;
      } else {
        // Tight, regular R-R with only trivial jitter (<3%) — IVR is regular.
        lastR += meanRR * (1 + (Math.random() * 2 - 1) * 0.02);
      }
      return { tR: lastR, waves: jitterBeat(ivrBeat), isVentricular: true };
    },
  };
}
