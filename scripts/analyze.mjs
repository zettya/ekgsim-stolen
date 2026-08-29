/**
 * Rhythm signature harness.
 *
 * Loads a rhythm generator, samples the rendered Lead II signal, and reports
 * OBSERVABLE metrics — measured from the waveform, not self-declared — so a
 * generated rhythm can be checked against its clinical fingerprint:
 *
 *   - ventRate   : ventricular (QRS) rate in bpm, from peak detection
 *   - rrCV       : R-R coefficient of variation (regularity; ~0 regular, high = irregular)
 *   - qrsWidthMs : mean QRS duration (wide => ventricular/aberrant)
 *   - pkAmp      : mean detected peak amplitude (mV)
 *   - activity   : fraction of time |signal| > 0.1 mV (high in VF, ~0 in asystole)
 *   - span       : peak-to-peak amplitude (mV); tiny => flatline
 *   - schedRate  : rate from the generator's own R-history (cross-check)
 *
 * Usage:
 *   node scripts/analyze.mjs <moduleFile> <exportName> [seconds]
 * Example:
 *   node scripts/analyze.mjs src/ecg/rhythms/vt.js createVT 20
 */

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { EcgEngine } from "../src/ecg/rhythm.js";
import { LEADS } from "../src/ecg/leads.js";

const [, , modArg, exportName, secsArg] = process.argv;
if (!modArg || !exportName) {
  console.error("usage: node scripts/analyze.mjs <moduleFile> <exportName> [seconds]");
  process.exit(2);
}

const T = Number(secsArg ?? 20);
const FS = 500;
const mod = await import(pathToFileURL(resolve(modArg)).href);
const factory = mod[exportName];
if (typeof factory !== "function") {
  console.error(`export "${exportName}" not found or not a function in ${modArg}`);
  process.exit(2);
}

const engine = new EcgEngine(factory());
const lead = LEADS.II;

const n = Math.floor(FS * T);
const sig = new Float32Array(n);
let gMax = -Infinity;
let gMin = Infinity;
let active = 0;
for (let i = 0; i < n; i++) {
  const v = engine.sample(i / FS, lead);
  sig[i] = v;
  if (v > gMax) gMax = v;
  if (v < gMin) gMin = v;
  if (Math.abs(v) > 0.1) active++;
}
const span = gMax - gMin;

// Peak detection: local maxima above a threshold, with a 240 ms refractory
// period so a single QRS counts once.
const thresh = Math.max(0.3, 0.4 * gMax);
const refractory = Math.floor(0.24 * FS);
const peaks = [];
let lastPeak = -refractory;
for (let i = 1; i < n - 1; i++) {
  if (
    sig[i] > thresh &&
    sig[i] >= sig[i - 1] &&
    sig[i] > sig[i + 1] &&
    i - lastPeak >= refractory
  ) {
    peaks.push(i);
    lastPeak = i;
  }
}

// R-R statistics.
const rr = [];
for (let i = 1; i < peaks.length; i++) rr.push((peaks[i] - peaks[i - 1]) / FS);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const rrMean = mean(rr);
const rrStd = rr.length
  ? Math.sqrt(mean(rr.map((x) => (x - rrMean) ** 2)))
  : 0;
const rrCV = rrMean > 0 ? rrStd / rrMean : 0;
const ventRate = rrMean > 0 ? Math.round(60 / rrMean) : 0;

// Mean QRS width: around each peak, width where |signal| stays above 0.15 mV.
const widths = [];
for (const p of peaks) {
  let l = p;
  let r = p;
  while (l > 0 && Math.abs(sig[l]) > 0.15) l--;
  while (r < n - 1 && Math.abs(sig[r]) > 0.15) r++;
  widths.push(((r - l) / FS) * 1000);
}
const qrsWidthMs = Math.round(mean(widths));
const pkAmp = mean(peaks.map((p) => sig[p]));

// Cross-check against the generator's own scheduled R-history.
const schedRate = engine.heartRate(T);

const out = {
  name: engine.rhythm.name,
  label: engine.rhythm.label,
  ventRate,
  rrCV: Number(rrCV.toFixed(3)),
  qrsWidthMs,
  pkAmp: Number(pkAmp.toFixed(3)),
  activity: Number((active / n).toFixed(3)),
  span: Number(span.toFixed(3)),
  peaks: peaks.length,
  schedRate,
  vitals: engine.rhythm.vitals,
  // Sequences let a verifier see stateful features the aggregates hide:
  // pauses/dropped beats show up as long R-R; premature/aberrant beats show up
  // as short R-R and wide-width outliers.
  rrSeq: rr.map((x) => Number(x.toFixed(3))),
  widths: widths.map((w) => Math.round(w)),
};
console.log(JSON.stringify(out, null, 2));
