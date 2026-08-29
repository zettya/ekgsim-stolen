/**
 * Sinus Tachycardia (ST).
 *
 * Normal sinus morphology (P wave before every narrow QRS) but at a fast,
 * regular rate of 100-150 bpm. Physiologically this is the sinus node
 * firing faster than normal — fever, pain, anxiety, hypovolemia, exertion —
 * rather than a distinct ectopic focus, so the beat-to-beat morphology and
 * rate variability stay tight and regular, unlike a chaotic or re-entrant
 * tachyarrhythmia.
 */

import { NORMAL_BEAT, jitterBeat } from "../waveform.js";
import { randRange, ratePerfusion } from "./util.js";

/**
 * Reference R-R interval (seconds) at which NORMAL_BEAT's repolarization
 * geometry (T-wave offset/width) is calibrated — roughly a 75 bpm resting beat.
 * @type {number}
 */
const QT_REF_RR = 0.8;

/**
 * Rate-correct the repolarization (T) wave. The QT interval shortens as heart
 * rate rises (Bazett: QT proportional to sqrt(RR)), so at tachycardic rates the
 * T wave rides earlier and tighter rather than dragging into — and fusing with
 * — the following beat's P wave. Only the T deflection is scaled; the
 * depolarization complex (P, Q, R, S) is left at its native geometry.
 *
 * @param {import("../waveform.js").Wave[]} beat  Base morphology.
 * @param {number} meanRR  Mean R-R interval in seconds.
 * @returns {import("../waveform.js").Wave[]}  New morphology with QT rate-corrected.
 */
function rateCorrectQt(beat, meanRR) {
  const k = Math.sqrt(Math.min(meanRR, QT_REF_RR) / QT_REF_RR);
  return beat.map((w) =>
    w.name === "T" ? { ...w, offset: w.offset * k, sigma: w.sigma * k } : w,
  );
}

/**
 * @param {Object} [opts]
 * @param {number} [opts.rate]  Sinus rate in bpm (default: random 100-150).
 * @returns {import("../rhythm.js").Rhythm}
 */
export function createSinusTach(opts = {}) {
  const rate = opts.rate ?? randRange(100, 150);
  const meanRR = 60 / rate;
  const beatShape = rateCorrectQt(NORMAL_BEAT, meanRR);
  const perf = ratePerfusion(rate);

  let lastR = null;

  return {
    name: "Sinus Tachycardia",
    label: "ST",
    // Faster rate → shorter diastolic filling → lower pressure. Scaling the
    // baseline by the perfusion factor makes a 148-bpm ST read notably softer
    // than a 105-bpm one, instead of both showing the same pressure.
    vitals: {
      sys: randRange(116, 132) * perf,
      dia: randRange(72, 86) * perf,
      spo2: randRange(96, 99),
    },
    nextBeat() {
      if (lastR === null) {
        lastR = 0;
      } else {
        // Tight regularity (rrCV < 0.08): small jitter only, no slow
        // sinus-arrhythmia-style oscillation like NSR uses.
        lastR += meanRR * (1 + (Math.random() * 2 - 1) * 0.02);
      }
      return { tR: lastR, waves: jitterBeat(beatShape) };
    },
  };
}
