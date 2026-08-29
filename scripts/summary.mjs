/**
 * Print a one-line signature for every rhythm in the registry. A fast
 * regression check that the whole library still produces sane, distinguishable
 * fingerprints.
 *
 * Usage: node scripts/summary.mjs [seconds]
 */

import { EcgEngine } from "../src/ecg/rhythm.js";
import { RHYTHMS } from "../src/ecg/rhythms/index.js";
import { LEADS } from "../src/ecg/leads.js";

const T = Number(process.argv[2] ?? 15);
const FS = 500;

/** Measure observable signature metrics for one rhythm instance. */
function measure(rhythm) {
  const engine = new EcgEngine(rhythm);
  const n = Math.floor(FS * T);
  const sig = new Float32Array(n);
  let gMax = -Infinity;
  let gMin = Infinity;
  let active = 0;
  for (let i = 0; i < n; i++) {
    const v = engine.sample(i / FS, LEADS.II);
    sig[i] = v;
    if (v > gMax) gMax = v;
    if (v < gMin) gMin = v;
    if (Math.abs(v) > 0.1) active++;
  }
  const thresh = Math.max(0.3, 0.4 * gMax);
  const refr = Math.floor(0.24 * FS);
  const peaks = [];
  let last = -refr;
  for (let i = 1; i < n - 1; i++) {
    if (sig[i] > thresh && sig[i] >= sig[i - 1] && sig[i] > sig[i + 1] && i - last >= refr) {
      peaks.push(i);
      last = i;
    }
  }
  const rr = [];
  for (let i = 1; i < peaks.length; i++) rr.push((peaks[i] - peaks[i - 1]) / FS);
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const rrMean = mean(rr);
  const rrStd = rr.length ? Math.sqrt(mean(rr.map((x) => (x - rrMean) ** 2))) : 0;
  return {
    label: rhythm.label,
    ventRate: rrMean > 0 ? Math.round(60 / rrMean) : 0,
    rrCV: rrMean > 0 ? rrStd / rrMean : 0,
    activity: active / n,
    span: gMax - gMin,
    bp: `${Math.round(rhythm.vitals.sys)}/${Math.round(rhythm.vitals.dia)}`,
  };
}

const pad = (s, n) => String(s).padEnd(n);
console.log(
  pad("RHYTHM", 8),
  pad("rate", 6),
  pad("rrCV", 7),
  pad("activity", 10),
  pad("span", 7),
  "BP",
);
for (const entry of RHYTHMS) {
  const m = measure(entry.make());
  console.log(
    pad(m.label, 8),
    pad(m.ventRate, 6),
    pad(m.rrCV.toFixed(3), 7),
    pad(m.activity.toFixed(3), 10),
    pad(m.span.toFixed(3), 7),
    m.bp,
  );
}
