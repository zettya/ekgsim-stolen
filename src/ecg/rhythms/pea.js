/**
 * Pulseless Electrical Activity (PEA).
 *
 * An organized, regular electrical rhythm on the monitor — narrow sinus-like
 * or wide idioventricular-like — with no corresponding pulse or perfusion.
 * The teaching point is the dissonance: the trace looks like a "real" rhythm,
 * often slow, yet the patient has no measurable blood pressure or oxygenation.
 */

import { NORMAL_BEAT, jitterBeat } from "../waveform.js";
import { randRange } from "./util.js";

/**
 * Wide idioventricular-like complex (no P wave, widened QRS-T).
 * @type {import("../waveform.js").Wave[]}
 */
const WIDE_BEAT = [
  { name: "Q", offset: -0.03, amp: -0.12, sigma: 0.02 },
  { name: "R", offset: 0.0, amp: 1.1, sigma: 0.05 },
  { name: "T", offset: 0.28, amp: -0.3, sigma: 0.07 },
];

/**
 * Create a Pulseless Electrical Activity rhythm generator.
 *
 * The trace is an organized, regular rhythm (narrow sinus-like or wide
 * idioventricular-like morphology, chosen at random) at a slow rate — but the
 * patient is pulseless, so vitals are all zero (non-perfusing).
 *
 * @param {Object} [opts]
 * @param {number} [opts.rate]      Regular ventricular rate in bpm (default: random 30-70).
 * @param {boolean} [opts.wide]     Force wide idioventricular-like morphology
 *   (default: random 50/50 between narrow sinus-like and wide morphology).
 * @returns {import("../rhythm.js").Rhythm}
 */
export function createPEA(opts = {}) {
  const rate = opts.rate ?? randRange(30, 70);
  const meanRR = 60 / rate;
  const wide = opts.wide ?? Math.random() < 0.5;
  const morphology = wide ? WIDE_BEAT : NORMAL_BEAT;

  let lastR = null;

  return {
    name: "Pulseless Electrical Activity",
    label: "PEA",
    vitals: { sys: 0, dia: 0, spo2: 0 },
    nextBeat() {
      if (lastR === null) {
        lastR = 0;
      } else {
        lastR += meanRR * (1 + (Math.random() * 2 - 1) * 0.02);
      }
      return { tR: lastR, waves: jitterBeat(morphology) };
    },
  };
}
