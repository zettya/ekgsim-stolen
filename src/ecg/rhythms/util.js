/**
 * Small stochastic helpers shared by rhythm generators. Baking randomness into
 * each generator's defaults is what makes rhythms procedural — the same
 * archetype is drawn fresh (rate, morphology, timing) every time it is created.
 */

/**
 * Uniform random float in [min, max).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randRange(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Uniform random integer in [min, max] (inclusive).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/**
 * Coin flip with the given probability of `true`.
 * @param {number} p  Probability in [0, 1].
 * @returns {boolean}
 */
export function chance(p) {
  return Math.random() < p;
}

/**
 * Pick a uniformly random element of an array.
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
export function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Physiologic perfusion factor for a ventricular rate. Cardiac output peaks near
 * a resting ~75 bpm and falls off as the rate climbs (diastolic filling time
 * collapses) or drops (low output). Returns a multiplier of ~1.0 at 75 bpm,
 * tapering toward the extremes — tachycardia is penalized a little harder per
 * bpm than bradycardia, matching the steeper blood-pressure fall when filling
 * time runs out. Intended to scale a rhythm's baseline systolic/diastolic so the
 * displayed pressure stays consistent with the rate on the trace.
 *
 * @param {number} rate  Ventricular rate in bpm.
 * @returns {number}     Perfusion multiplier, clamped to [0.68, 1.02].
 */
export function ratePerfusion(rate) {
  const ideal = 75;
  const d = rate - ideal;
  const slope = d >= 0 ? 0.0021 : 0.0016;
  return Math.max(0.68, Math.min(1.02, 1 - slope * Math.abs(d)));
}
