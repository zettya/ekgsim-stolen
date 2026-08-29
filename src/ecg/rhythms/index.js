/**
 * Rhythm registry.
 *
 * Every rhythm generator is a factory `(opts) => Rhythm` that self-randomizes
 * its parameters when called with no opts — that self-randomization is what
 * makes the "never the same twice" behavior fall out for free. Adding a rhythm
 * is a two-line change here plus one new file in this directory.
 */

import { choice } from "./util.js";
import { createNSR } from "./nsr.js";
import { createSinusBrady } from "./sbrady.js";
import { createSinusTach } from "./stach.js";
import { createAFib } from "./afib.js";
import { createAFlutter } from "./aflutter.js";
import { createSVT } from "./svt.js";
import { createAVB1 } from "./avb1.js";
import { createMobitz1 } from "./mobitz1.js";
import { createMobitz2 } from "./mobitz2.js";
import { createCHB } from "./chb.js";
import { createJunctional } from "./junctional.js";
import { createIVR } from "./ivr.js";
import { createPVC } from "./pvc.js";
import { createVT } from "./vt.js";
import { createTorsades } from "./torsades.js";
import { createVF } from "./vf.js";
import { createAsystole } from "./asystole.js";
import { createPEA } from "./pea.js";

/**
 * Diagnostic family groupings, in teaching order. Used to lay out the quiz
 * answer bank so look-alikes sit together (sinus → atrial → blocks →
 * junctional → ventricular → arrest).
 * @type {string[]}
 */
export const FAMILY_ORDER = [
  "Sinus",
  "Atrial",
  "AV Block",
  "Junctional",
  "Ventricular",
  "Arrest",
];

/**
 * Ordered list of available rhythms, arranged roughly by teaching progression
 * (sinus → atrial → AV blocks → junctional/ventricular escape → lethal).
 *   - `id`     stable identifier for URLs/state.
 *   - `make`   builds a fresh, randomized instance.
 *   - `name`   full clinical name (the quiz answer text).
 *   - `family` diagnostic group, one of {@link FAMILY_ORDER}.
 *   - `teach`  one-line key-feature blurb shown on quiz reveal.
 * @type {{id: string, make: function(Object=): import("../rhythm.js").Rhythm,
 *   name: string, family: string, teach: string}[]}
 */
export const RHYTHMS = [
  { id: "nsr", make: createNSR, name: "Normal Sinus Rhythm", family: "Sinus",
    teach: "Upright P before every narrow QRS; regular, ~60–100 bpm." },
  { id: "sbrady", make: createSinusBrady, name: "Sinus Bradycardia", family: "Sinus",
    teach: "Normal sinus morphology, regular, rate < 60 bpm." },
  { id: "stach", make: createSinusTach, name: "Sinus Tachycardia", family: "Sinus",
    teach: "Normal sinus morphology, P before every QRS, rate > 100 bpm." },
  { id: "afib", make: createAFib, name: "Atrial Fibrillation", family: "Atrial",
    teach: "Irregularly irregular, no P waves, fibrillatory baseline." },
  { id: "aflutter", make: createAFlutter, name: "Atrial Flutter", family: "Atrial",
    teach: "Sawtooth flutter waves; regular response at a fixed AV ratio." },
  { id: "svt", make: createSVT, name: "Supraventricular Tachycardia", family: "Atrial",
    teach: "Fast, regular, narrow QRS with no visible P (buried)." },
  { id: "avb1", make: createAVB1, name: "First-Degree AV Block", family: "AV Block",
    teach: "Every P conducts, but the PR interval is long (> 200 ms)." },
  { id: "mobitz1", make: createMobitz1, name: "Second-Degree AV Block, Mobitz I", family: "AV Block",
    teach: "PR lengthens progressively until a QRS drops (grouped beating)." },
  { id: "mobitz2", make: createMobitz2, name: "Second-Degree AV Block, Mobitz II", family: "AV Block",
    teach: "Constant PR, then a sudden dropped QRS with no warning." },
  { id: "chb", make: createCHB, name: "Third-Degree (Complete) AV Block", family: "AV Block",
    teach: "AV dissociation — P's march independently of a slow escape QRS." },
  { id: "junctional", make: createJunctional, name: "Junctional Rhythm", family: "Junctional",
    teach: "Absent or inverted P adjacent to a narrow QRS; regular 40–60 bpm." },
  { id: "ivr", make: createIVR, name: "Idioventricular Rhythm", family: "Ventricular",
    teach: "Wide, regular, no P — ventricular escape (20–40; AIVR 40–100)." },
  { id: "pvc", make: createPVC, name: "Sinus Rhythm with PVCs", family: "Ventricular",
    teach: "Early wide bizarre beat, no P, discordant T, compensatory pause." },
  { id: "vt", make: createVT, name: "Monomorphic Ventricular Tachycardia", family: "Ventricular",
    teach: "Wide, fast, regular, monomorphic complexes; no P waves." },
  { id: "torsades", make: createTorsades, name: "Torsades de Pointes", family: "Ventricular",
    teach: "Polymorphic VT twisting around the baseline (waxing spindles)." },
  { id: "vf", make: createVF, name: "Ventricular Fibrillation", family: "Arrest",
    teach: "Chaotic, no discrete complexes — pulseless. Defibrillate." },
  { id: "asystole", make: createAsystole, name: "Asystole", family: "Arrest",
    teach: "Flatline, no electrical activity. Confirm in two leads." },
  { id: "pea", make: createPEA, name: "Pulseless Electrical Activity", family: "Arrest",
    teach: "Organized rhythm on the monitor but no pulse — treat the cause." },
];

/**
 * Build a rhythm by id, falling back to NSR for an unknown id.
 * @param {string} id
 * @param {Object} [opts]
 * @returns {import("../rhythm.js").Rhythm}
 */
export function makeById(id, opts) {
  const entry = RHYTHMS.find((r) => r.id === id);
  return entry ? entry.make(opts) : createNSR(opts);
}

/**
 * Build a fresh instance of a uniformly random rhythm.
 * @returns {import("../rhythm.js").Rhythm}
 */
export function randomRhythm() {
  return choice(RHYTHMS).make();
}
