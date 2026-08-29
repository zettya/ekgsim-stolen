/**
 * First-Degree AV Block (1AVB).
 *
 * Every P wave conducts to the ventricles — no beats are dropped — but the
 * PR interval is pathologically prolonged (>200 ms, here 240-320 ms) because
 * conduction through the AV node is delayed. Otherwise the rhythm looks just
 * like normal sinus rhythm: regular rate, narrow QRS, normal vitals. The only
 * morphology change from NORMAL_BEAT is pulling the P wave's offset earlier
 * (more negative) so it sits further ahead of the R-peak.
 */

import { NORMAL_BEAT, jitterBeat } from "../waveform.js";
import { randRange } from "./util.js";

/**
 * @param {Object} [opts]
 * @param {number} [opts.rate]  Ventricular (= atrial, since 1:1 conduction) rate in bpm (default: random 60-90).
 * @returns {import("../rhythm.js").Rhythm}
 */
export function createAVB1(opts = {}) {
  const rate = opts.rate ?? randRange(60, 90);
  const meanRR = 60 / rate;

  // Prolonged PR: pull the P wave earlier than normal (-0.16) to 240-320 ms
  // ahead of the R-peak, while Q/R/S/T stay at their normal offsets.
  const prolongedPROffset = randRange(-0.32, -0.24);
  const BEAT = NORMAL_BEAT.map((w) => (w.name === "P" ? { ...w, offset: prolongedPROffset } : w));

  let lastR = null;
  let phase = Math.random() * Math.PI * 2;

  return {
    name: "First-Degree AV Block",
    label: "1AVB",
    vitals: { sys: randRange(115, 128), dia: randRange(72, 82), spo2: randRange(97, 99) },
    nextBeat() {
      if (lastR === null) {
        lastR = 0;
      } else {
        phase += (2 * Math.PI * meanRR) / 4;
        lastR += meanRR * (1 + 0.05 * Math.sin(phase)) * (1 + (Math.random() * 2 - 1) * 0.03);
      }
      return { tR: lastR, waves: jitterBeat(BEAT) };
    },
  };
}
