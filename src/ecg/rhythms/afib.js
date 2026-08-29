/**
 * Atrial fibrillation (AFib), typically-conducted rate.
 *
 * Irregularly irregular narrow-complex rhythm: the SA node is replaced by
 * chaotic atrial fibrillatory activity, so there is no true P wave. Instead
 * the baseline in the T-P segment is perturbed by a handful of tiny, randomly
 * placed Gaussian "f-wave" bumps that differ beat to beat. The AV node
 * conducts irregularly, so each R-R interval is drawn independently rather
 * than varying around a fixed mean — the hallmark "irregularly irregular"
 * ventricular response. QRS morphology itself stays narrow and normal.
 */

import { NORMAL_BEAT, jitterBeat } from "../waveform.js";
import { randRange, randInt, choice } from "./util.js";

/** Narrow QRS + T reference morphology, derived from NORMAL_BEAT minus P. */
const QRST_BEAT = NORMAL_BEAT.filter((w) => w.name !== "P");

/**
 * Build a set of tiny chaotic fibrillatory (f) waves for one beat, scattered
 * across the T-P segment (i.e. before the next R-peak, in negative-offset
 * territory relative to this beat's R). Count and placement differ every
 * call so the baseline never repeats.
 *
 * @returns {import("../waveform.js").Wave[]} 2-4 low-amplitude f-waves.
 */
function makeFWaves() {
  const count = randInt(2, 4);
  const waves = [];
  for (let i = 0; i < count; i += 1) {
    waves.push({
      name: "f",
      offset: randRange(-0.35, -0.08),
      amp: randRange(-0.06, 0.06),
      sigma: randRange(0.015, 0.025),
    });
  }
  return waves;
}

/**
 * Create an Atrial Fibrillation rhythm generator (typically-conducted
 * ventricular rate, no RVR/slow variant). Every call self-randomizes vitals
 * and per-beat timing/morphology so no two instances play identically.
 *
 * @param {Object} [opts] Reserved for future overrides; currently unused.
 * @returns {import("../rhythm.js").Rhythm} A stateful AFib rhythm.
 */
export function createAFib(opts = {}) {
  // Ventricular response category — the same rhythm presents very differently
  // depending on how fast the AV node conducts. Each still draws every R-R
  // independently, preserving the irregularly-irregular hallmark.
  const RESPONSES = {
    rvr: { name: "Rapid Ventricular Response", lo: 0.34, hi: 0.54 },
    controlled: { name: "controlled", lo: 0.55, hi: 0.98 },
    slow: { name: "slow ventricular response", lo: 0.92, hi: 1.4 },
  };
  const key = opts.response ?? choice(["rvr", "controlled", "controlled", "slow"]);
  const resp = RESPONSES[key];
  let lastR = null;

  return {
    name:
      key === "controlled"
        ? "Atrial Fibrillation"
        : `Atrial Fibrillation (${resp.name})`,
    label: "AFib",
    vitals: {
      sys: Math.round(randRange(key === "rvr" ? 98 : 110, key === "rvr" ? 118 : 130)),
      dia: Math.round(randRange(68, 85)),
      spo2: randInt(95, 98),
    },
    nextBeat() {
      if (lastR === null) {
        lastR = 0;
      } else {
        // Each R-R interval is drawn independently within the response band —
        // irregularly irregular, but centered on this presentation's rate.
        lastR += randRange(resp.lo, resp.hi);
      }
      const waves = [...jitterBeat(QRST_BEAT), ...makeFWaves()];
      return { tR: lastR, waves, isVentricular: true };
    },
  };
}
