/**
 * Waveform primitives for ECG beat morphology.
 *
 * A single beat is modeled as a sum of Gaussian "bumps", one per deflection
 * (P, Q, R, S, T). This is the approach used by the ECGSYN model
 * (McSharry & Clifford, 2003) and produces smooth, physiologically shaped
 * complexes that render cleanly at any sample rate — the key to avoiding the
 * jagged, "off" look of naive line-segment ECGs.
 *
 * All time offsets are in seconds relative to the R-peak (t = 0).
 * All amplitudes are in millivolts (mV), referenced to Lead II.
 */

/**
 * A single Gaussian deflection.
 * @typedef {Object} Wave
 * @property {string} name    Deflection label ("P", "Q", "R", "S", "T").
 * @property {number} offset  Center time in seconds, relative to the R-peak.
 * @property {number} amp     Peak amplitude in mV (signed).
 * @property {number} sigma   Standard deviation (width) in seconds.
 */

/**
 * Canonical normal-sinus PQRST morphology in the Lead II reference frame.
 * Values are typical adult resting figures; rhythms jitter these per beat.
 * @type {Wave[]}
 */
export const NORMAL_BEAT = [
  { name: "P", offset: -0.16, amp: 0.15, sigma: 0.025 },
  { name: "Q", offset: -0.025, amp: -0.1, sigma: 0.012 },
  { name: "R", offset: 0.0, amp: 1.2, sigma: 0.011 },
  { name: "S", offset: 0.025, amp: -0.25, sigma: 0.012 },
  { name: "T", offset: 0.23, amp: 0.35, sigma: 0.06 },
];

/**
 * Evaluate a single wave's contribution at a given time.
 *
 * @param {Wave} wave    The Gaussian deflection.
 * @param {number} dt    Time relative to the R-peak, in seconds.
 * @returns {number}     Contribution in mV.
 */
export function evalWave(wave, dt) {
  const z = (dt - wave.offset) / wave.sigma;
  return wave.amp * Math.exp(-0.5 * z * z);
}

/**
 * Evaluate a full beat (sum of its waves) at a time relative to the R-peak.
 *
 * @param {Wave[]} waves   The beat's deflections.
 * @param {number} dt      Time relative to the R-peak, in seconds.
 * @param {number} [gain]  Per-lead amplitude multiplier (default 1).
 * @returns {number}       Signal in mV.
 */
export function evalBeat(waves, dt, gain = 1) {
  let v = 0;
  for (const w of waves) v += evalWave(w, dt);
  return v * gain;
}

/**
 * How far (in seconds) a beat's influence extends from its R-peak. Beyond this
 * the Gaussian tails are negligible, so the sampler can ignore distant beats.
 * @type {number}
 */
export const BEAT_SUPPORT = 0.55;

/**
 * Produce a copy of a beat morphology with small physiologic jitter applied,
 * so no two beats are ever byte-identical. This is what keeps generated
 * rhythms from looking robotic.
 *
 * @param {Wave[]} waves        Base morphology.
 * @param {number} [ampVar]     Fractional amplitude jitter (default 0.06).
 * @param {number} [timeVar]    Absolute offset jitter in seconds (default 0.004).
 * @returns {Wave[]}            A new, jittered morphology array.
 */
export function jitterBeat(waves, ampVar = 0.06, timeVar = 0.004) {
  return waves.map((w) => ({
    name: w.name,
    offset: w.offset + (Math.random() * 2 - 1) * timeVar,
    amp: w.amp * (1 + (Math.random() * 2 - 1) * ampVar),
    sigma: w.sigma,
  }));
}
