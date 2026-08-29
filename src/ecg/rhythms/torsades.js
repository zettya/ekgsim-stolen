/**
 * Torsades de Pointes (TdP).
 *
 * A polymorphic ventricular tachycardia: a run of wide QRS complexes whose
 * amplitude waxes and wanes and appears to "twist" around the baseline. The
 * peaks point up, shrink through the isoelectric line, then point down, and the
 * cycle repeats — the classic spindle / node pattern. Fast (~200-250 bpm) and
 * hemodynamically unstable: pulseless, non-perfusing (all vitals 0).
 *
 * The twist is modeled as a QRS *vector rotating* in the frontal plane, sampled
 * once per beat and projected onto the monitored lead. Two lobes 90° out of
 * phase (`main` = sin θ, `quad` = cos θ) mean the complex does not merely scale
 * and flip: it rolls smoothly through a biphasic form at each node, so the trace
 * reads as a twisting ribbon (accordion in-and-out) rather than a block of
 * same-direction humps that abruptly invert.
 */

import { randRange } from "./util.js";

/**
 * Create a Torsades de Pointes rhythm generator.
 *
 * @param {Object} [opts] Optional overrides (self-randomized when omitted).
 * @param {number} [opts.rate] Ventricular rate in bpm (default: random 200-250).
 * @param {number} [opts.period] Twist rotation period in seconds
 *   (default: random 2.6-4.2). One full up→node→down→node→up axis rotation;
 *   longer periods pack more complexes into each spindle for a smoother twist.
 * @param {number} [opts.baseAmp] Peak R-wave amplitude in mV at a spindle belly
 *   (default: random 1.0-1.5).
 * @returns {import("../rhythm.js").Rhythm}
 */
export function createTorsades(opts = {}) {
  const rate = opts.rate ?? randRange(200, 250);
  const period = opts.period ?? randRange(2.6, 4.2);
  const baseAmp = opts.baseAmp ?? randRange(1.0, 1.5);
  const meanRR = 60 / rate;

  // Single ventricular clock — successive complexes march forward in time so
  // tR is strictly non-decreasing.
  let nextR = 0;
  // Random phase so each instance starts at a different point in the twist.
  const phase = Math.random() * Math.PI * 2;
  const jit = () => Math.random() * 2 - 1;

  return {
    name: "Torsades de Pointes",
    label: "TdP",
    // Pulseless polymorphic VT — non-perfusing, so all vitals report zero.
    vitals: { sys: 0, dia: 0, spo2: 0 },
    nextBeat() {
      const tR = nextR;
      const theta = (2 * Math.PI * tR) / period + phase;

      // Rotating QRS vector projected onto the lead. `main` is the dominant
      // lobe: its magnitude gives the spindle wax/wane and its sign flips the
      // complex up/down across a node. `quad` is 90° out of phase, so it is
      // largest exactly where `main` nulls — filling each node with a small
      // biphasic deflection and rotating the morphology instead of blanking it.
      const main = baseAmp * Math.sin(theta);
      const quad = baseAmp * 0.42 * Math.cos(theta);

      const waves = [
        // Dominant R lobe (rotates and flips with the twist).
        { name: "R", offset: 0.0 + jit() * 0.004, amp: main, sigma: 0.037 * (1 + jit() * 0.06) },
        // Terminal S, tied to the dominant lobe so QRS shape survives the flip.
        { name: "S", offset: 0.052 + jit() * 0.004, amp: -0.32 * main, sigma: 0.037 * (1 + jit() * 0.06) },
        // Quadrature lobe: peaks at the nodes, giving the biphasic "roll-over".
        { name: "R", offset: 0.022 + jit() * 0.004, amp: quad, sigma: 0.05 * (1 + jit() * 0.06) },
      ];

      // Advance the ventricular clock with mild beat-to-beat variability.
      nextR += meanRR * (1 + jit() * 0.04);

      return { tR, waves, isVentricular: true };
    },
  };
}
