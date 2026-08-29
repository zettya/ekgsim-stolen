/**
 * Junctional Rhythm (Junctional Escape).
 *
 * The AV node takes over as pacemaker when the sinus node fails to fire fast
 * enough. Conduction still proceeds down the normal His-Purkinje system, so
 * the QRS stays narrow, but atrial depolarization is either absent or
 * retrograde (the impulse travels backward up into the atria), producing an
 * inverted P wave that sits immediately adjacent to the QRS rather than
 * preceding it by a normal PR interval. The rhythm is slow (40-60 bpm) but
 * perfectly regular, and cardiac output is usually just barely adequate.
 */

import { NORMAL_BEAT, jitterBeat } from "../waveform.js";
import { randRange, choice } from "./util.js";

/** Narrow QRST morphology shared by every beat (no antegrade P wave baked in). */
const QRST = NORMAL_BEAT.filter((w) => w.name !== "P");

/**
 * @param {Object} [opts]
 * @param {number} [opts.rate]      Junctional escape rate in bpm (default: random 40-60).
 * @param {"before"|"after"|"hidden"} [opts.pPlacement]  Where the retrograde P
 *   sits relative to the QRS (default: random per instance). A junctional focus
 *   depolarizes the atria retrogradely; depending on focus height the inverted
 *   P precedes the QRS (short PR), is buried inside it (not visible), or follows
 *   it in the early ST segment.
 * @returns {import("../rhythm.js").Rhythm}
 */
export function createJunctional(opts = {}) {
  const rate = opts.rate ?? randRange(40, 60);
  const meanRR = 60 / rate;
  const pPlacement = opts.pPlacement ?? choice(["before", "after", "hidden"]);

  // Small inverted retrograde P wave. Because the impulse conducts backward from
  // the junction into the atria, the P is inverted and sits immediately adjacent
  // to the QRS (not a normal PR interval away): just before it (short PR), buried
  // within it, or just after it in the early ST segment.
  const pAmp = -randRange(0.06, 0.12);
  let beatWaves = QRST;
  if (pPlacement === "before") {
    beatWaves = [{ name: "P", offset: -0.06, amp: pAmp, sigma: 0.02 }, ...QRST];
  } else if (pPlacement === "after") {
    beatWaves = [...QRST, { name: "P", offset: 0.11, amp: pAmp, sigma: 0.022 }];
  }

  let lastR = null;

  return {
    name: "Junctional Rhythm",
    label: "JUNC",
    vitals: {
      sys: randRange(100, 118),
      dia: randRange(62, 76),
      spo2: randRange(95, 98),
    },
    nextBeat() {
      if (lastR === null) {
        lastR = 0;
      } else {
        // Tight regularity (junctional escape is metronomic) with only a
        // whisper of physiologic jitter so beats never repeat exactly.
        lastR += meanRR * (1 + (Math.random() * 2 - 1) * 0.015);
      }
      return { tR: lastR, waves: jitterBeat(beatWaves) };
    },
  };
}
