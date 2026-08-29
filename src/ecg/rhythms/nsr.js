/**
 * Normal Sinus Rhythm.
 *
 * Reference rhythm: upright P, narrow QRS, upright T, regular rate with
 * physiologic respiratory sinus arrhythmia. Serves as the template every other
 * rhythm generator is measured against.
 */

import { NORMAL_BEAT, jitterBeat } from "../waveform.js";
import { randRange, randInt, ratePerfusion } from "./util.js";

/**
 * @param {Object} [opts]
 * @param {number} [opts.rate]  Mean heart rate in bpm (default: random 60-95).
 * @param {number} [opts.rsa]   Respiratory sinus arrhythmia depth (default 0.05).
 * @returns {import("../rhythm.js").Rhythm}
 */
export function createNSR(opts = {}) {
  const rate = opts.rate ?? randRange(60, 95);
  const rsa = opts.rsa ?? 0.05;
  const meanRR = 60 / rate;
  const perf = ratePerfusion(rate);
  let lastR = null;
  let phase = Math.random() * Math.PI * 2;

  return {
    name: "Normal Sinus Rhythm",
    label: "NSR",
    // Randomized within a healthy-adult range (the same "never the same twice"
    // contract every other rhythm honors) and scaled by the rate's perfusion
    // factor, so pressure tracks the drawn rate rather than floating free.
    vitals: {
      sys: randRange(112, 128) * perf,
      dia: randRange(70, 82) * perf,
      spo2: randInt(97, 99),
    },
    nextBeat() {
      if (lastR === null) {
        lastR = 0;
      } else {
        phase += (2 * Math.PI * meanRR) / 4.0;
        const resp = 1 + rsa * Math.sin(phase);
        const noise = 1 + (Math.random() * 2 - 1) * 0.03;
        lastR += meanRR * resp * noise;
      }
      return { tR: lastR, waves: jitterBeat(NORMAL_BEAT) };
    },
  };
}
