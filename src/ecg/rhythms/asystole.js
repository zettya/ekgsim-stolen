/**
 * Asystole.
 *
 * Flatline — complete absence of ventricular electrical activity. No P, QRS,
 * or T deflections are emitted; only the engine's baseline wander/noise
 * remains visible. Rarely, a tiny agonal bump may fire, but it never
 * constitutes a real complex and is flagged non-ventricular. Non-perfusing:
 * vitals are zeroed.
 */

import { chance, randRange } from "./util.js";

/**
 * @param {Object} [opts]
 * @param {number} [opts.interval]  Mean spacing between pseudo-beats in
 *   seconds (default: random 0.8-1.2). Only affects internal clock advance
 *   cadence; no real heartbeats occur.
 * @returns {import("../rhythm.js").Rhythm}
 */
export function createAsystole(opts = {}) {
  const interval = opts.interval ?? randRange(0.8, 1.2);
  let lastR = null;

  return {
    name: "Asystole",
    label: "ASYS",
    vitals: { sys: 0, dia: 0, spo2: 0 },
    nextBeat() {
      if (lastR === null) {
        lastR = 0;
      } else {
        lastR += interval * randRange(0.9, 1.1);
      }

      const waves = chance(0.03)
        ? [{ name: "agonal", offset: 0, amp: randRange(0.03, 0.08), sigma: randRange(0.02, 0.04) }]
        : [];

      return { tR: lastR, waves, isVentricular: false };
    },
  };
}
