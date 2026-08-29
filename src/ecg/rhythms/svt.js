/**
 * Supraventricular Tachycardia (SVT).
 *
 * A fast, regular, narrow-complex tachycardia (150-220 bpm). The re-entrant
 * circuit (AV nodal or AV reentrant) depolarizes atria and ventricles nearly
 * simultaneously, so P waves are buried within or immediately after the QRS
 * and are not visible as a distinct deflection — only a single, tight-jitter
 * narrow QRST clock is modeled. Perfusion is reduced but present (borderline
 * hypotensive, mildly desaturated) rather than absent.
 */

import { NORMAL_BEAT, jitterBeat } from "../waveform.js";
import { randRange, ratePerfusion } from "./util.js";

/** Narrow QRS morphology with no P wave (retrograde/buried). */
const SVT_QRS = NORMAL_BEAT.filter((w) => w.name !== "P");

/**
 * Build a rate-adapted narrow-complex beat. At tachycardic rates the QT
 * interval shortens (Bazett-like, ~sqrt of R-R), so repolarization completes
 * before the next QRS instead of fusing with it. Without this, the T wave sits
 * at a fixed ~230 ms and collides with the following complex at fast rates,
 * rendering a spuriously WIDE fused complex.
 *
 * @param {number} meanRR  Mean R-R interval in seconds.
 * @returns {import("../waveform.js").Wave[]}  Rate-adapted narrow QRST.
 */
function svtBeat(meanRR) {
  const qtScale = Math.min(1, Math.sqrt(meanRR / 0.8));
  return SVT_QRS.map((w) =>
    w.name === "T"
      ? { ...w, offset: w.offset * qtScale, sigma: w.sigma * qtScale }
      : w,
  );
}

/**
 * @param {Object} [opts]
 * @param {number} [opts.rate]  Ventricular rate in bpm (default: random 150-220).
 * @returns {import("../rhythm.js").Rhythm}
 */
export function createSVT(opts = {}) {
  const rate = opts.rate ?? randRange(150, 220);
  const meanRR = 60 / rate;
  const baseBeat = svtBeat(meanRR);
  const perf = ratePerfusion(rate);

  let lastR = null;

  return {
    name: "Supraventricular Tachycardia",
    label: "SVT",
    // Very fast re-entry → poor filling. A near-normal baseline scaled by the
    // (steep, at these rates) perfusion factor lands SVT in the borderline-
    // hypotensive range, worse the faster it runs.
    vitals: {
      sys: randRange(118, 130) * perf,
      dia: randRange(74, 84) * perf,
      spo2: randRange(93, 97),
    },
    nextBeat() {
      if (lastR === null) {
        lastR = 0;
      } else {
        // Very tight regularity: sub-2% RR jitter keeps rrCV well under 0.06.
        lastR += meanRR * (1 + (Math.random() * 2 - 1) * 0.01);
      }
      return { tR: lastR, waves: jitterBeat(baseBeat) };
    },
  };
}
