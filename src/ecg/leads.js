/**
 * Lead projection model.
 *
 * Every lead observes the same underlying cardiac activity from a different
 * angle. A full physical model projects a 3-D heart dipole onto each lead axis;
 * for the monitoring phase we use a lighter, per-wave coefficient table that
 * captures the clinically important morphology differences between leads
 * (e.g. dominant S and biphasic P in V1/MCL1) while keeping one shared beat
 * timeline. Swapping in a true dipole projection later requires no change to
 * the rhythm engine — only this module.
 */

/**
 * Per-wave amplitude coefficients relative to the Lead II reference beat.
 * Keys match {@link NORMAL_BEAT} wave names. A value of 1 means "same as
 * Lead II"; negative values invert the deflection.
 * @typedef {Object.<string, number>} LeadProfile
 */

/**
 * Built-in lead profiles. Lead II is the reference (all coefficients 1).
 * @type {Object.<string, {label: string, coef: LeadProfile}>}
 */
export const LEADS = {
  I: {
    label: "I",
    coef: { P: 0.8, Q: 0.9, R: 0.85, S: 0.7, T: 0.8 },
  },
  II: {
    label: "II",
    coef: { P: 1.0, Q: 1.0, R: 1.0, S: 1.0, T: 1.0 },
  },
  III: {
    label: "III",
    coef: { P: 0.7, Q: 1.1, R: 0.75, S: 0.9, T: 0.6 },
  },
  aVR: {
    // aVR looks "up" toward the right shoulder: P, QRS and T are all normally
    // inverted. Flipping every coefficient inverts the whole complex.
    label: "aVR",
    coef: { P: -0.8, Q: -0.9, R: -0.9, S: -0.9, T: -0.8 },
  },
  aVL: {
    label: "aVL",
    coef: { P: 0.5, Q: 0.9, R: 0.5, S: 0.6, T: 0.5 },
  },
  aVF: {
    label: "aVF",
    coef: { P: 0.85, Q: 1.0, R: 0.8, S: 0.85, T: 0.7 },
  },
  MCL1: {
    // MCL1 / V1-like: small P, tiny r, dominant deep S (rS pattern),
    // often inverted T. The base S amplitude is already negative, so a large
    // positive coefficient deepens it; a negative T coefficient inverts the T.
    label: "MCL1",
    coef: { P: 0.4, Q: 0.0, R: 0.25, S: 5.0, T: -0.5 },
  },
};

/**
 * Ordered lead ids for populating selectors.
 * @type {string[]}
 */
export const LEAD_IDS = ["I", "II", "III", "aVR", "aVL", "aVF", "MCL1"];

/**
 * Resolve a wave's per-lead gain by name.
 *
 * @param {{label: string, coef: LeadProfile}} lead  Lead profile.
 * @param {string} waveName                          Deflection name.
 * @returns {number}                                 Amplitude multiplier.
 */
export function leadGain(lead, waveName) {
  const c = lead.coef[waveName];
  return c === undefined ? 1 : c;
}
