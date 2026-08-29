/**
 * ACLS scenario + treatment layer for practice mode.
 *
 * The correct intervention for a rhythm depends on the *patient*, not the
 * tracing alone: the same VT is defibrillated when pulseless, cardioverted when
 * unstable-with-pulse, and treated with an antiarrhythmic when stable. So each
 * quiz round draws a clinical *scenario* (pulse present? stable or unstable?)
 * for the rhythm, adjusts the displayed vitals to match, and the correct
 * treatment is computed from (rhythm, scenario) together.
 *
 * Answers stay at the algorithm-decision level (defibrillate vs synchronized
 * cardioversion vs pace vs drug vs treat-the-cause), never doses or joules —
 * those vary by protocol edition and medical direction.
 */

import { choice, randInt } from "../ecg/rhythms/util.js";

/**
 * @typedef {Object} Scenario
 * @property {boolean} pulse                 Whether a pulse is palpable.
 * @property {"stable"|"unstable"} [stability]  Perfusion state when pulse present.
 */

/**
 * Treatment catalog. `id` keys the answer buttons and the mapping below.
 * @type {Object.<string, {name: string, group: string}>}
 */
export const TREATMENTS = {
  defibrillate: { name: "Defibrillate (unsync)", group: "Electricity" },
  cardiovert: { name: "Synchronized cardioversion", group: "Electricity" },
  pacing: { name: "Transcutaneous pacing", group: "Electricity" },
  cpr_epi: { name: "CPR + epinephrine", group: "Medication" },
  atropine: { name: "Atropine", group: "Medication" },
  adenosine: { name: "Adenosine / vagal", group: "Medication" },
  amiodarone: { name: "Amiodarone", group: "Medication" },
  magnesium: { name: "Magnesium", group: "Medication" },
  rate_control: { name: "Rate control (β-B / CCB)", group: "Medication" },
  treat_cause: { name: "Treat underlying cause", group: "Supportive" },
  monitor: { name: "Monitor / observe", group: "Supportive" },
};

/** Ordered treatment groups for laying out the answer bank. */
export const TREATMENT_GROUPS = ["Electricity", "Medication", "Supportive"];

/**
 * Valid scenarios per rhythm id. Rhythms whose treatment turns on pulse/stability
 * list several (drawn at random each round); the rest are fixed. Anything not
 * listed falls back to a single stable, perfusing scenario.
 * @type {Object.<string, Scenario[]>}
 */
const SCENARIOS = {
  // Arrest — always pulseless.
  vf: [{ pulse: false }],
  asystole: [{ pulse: false }],
  pea: [{ pulse: false }],
  // Ventricular tachy — the full pulse/stability spread.
  vt: [
    { pulse: false },
    { pulse: true, stability: "unstable" },
    { pulse: true, stability: "stable" },
  ],
  // Sustained polymorphic VT/torsades is treated with an unsynchronized shock;
  // magnesium is an adjunct for recurrent torsades associated with long QT.
  torsades: [{ pulse: false }, { pulse: true, stability: "unstable" }],
  // Tachyarrhythmias with a pulse — stable vs unstable.
  svt: [
    { pulse: true, stability: "stable" },
    { pulse: true, stability: "unstable" },
  ],
  afib: [
    { pulse: true, stability: "stable" },
    { pulse: true, stability: "unstable" },
  ],
  aflutter: [
    { pulse: true, stability: "stable" },
    { pulse: true, stability: "unstable" },
  ],
  // Bradycardias / escapes — asymptomatic vs symptomatic.
  sbrady: [
    { pulse: true, stability: "stable" },
    { pulse: true, stability: "unstable" },
  ],
  junctional: [
    { pulse: true, stability: "stable" },
    { pulse: true, stability: "unstable" },
  ],
  ivr: [
    { pulse: true, stability: "stable" },
    { pulse: true, stability: "unstable" },
  ],
  mobitz2: [
    { pulse: true, stability: "stable" },
    { pulse: true, stability: "unstable" },
  ],
  chb: [
    { pulse: true, stability: "stable" },
    { pulse: true, stability: "unstable" },
  ],
};

/** Fallback for benign / always-stable rhythms (NSR, sinus tach, 1°/Mobitz I, PVCs). */
const STABLE = [{ pulse: true, stability: "stable" }];

/**
 * Draw a random valid scenario for a rhythm.
 * @param {string} rhythmId
 * @returns {Scenario}
 */
export function pickScenario(rhythmId) {
  return { ...choice(SCENARIOS[rhythmId] ?? STABLE) };
}

/**
 * Overlay a scenario's hemodynamics onto a rhythm so the monitor reflects it:
 * unstable → frankly hypotensive + flagged critical; stable → comfortably
 * perfusing; pulseless → zeroed (non-perfusing). Mutates the rhythm in place;
 * quiz-mode only, so browse mode keeps each rhythm's native vitals.
 *
 * @param {import("../ecg/rhythm.js").Rhythm} rhythm
 * @param {Scenario} sc
 */
export function applyScenario(rhythm, sc) {
  if (!sc.pulse) {
    rhythm.vitals = { sys: 0, dia: 0, spo2: 0 };
    rhythm.critical = true;
    return;
  }
  if (sc.stability === "unstable") {
    rhythm.vitals = { sys: randInt(62, 84), dia: randInt(36, 52), spo2: randInt(85, 92) };
    rhythm.critical = true;
  } else {
    rhythm.vitals = { sys: randInt(108, 126), dia: randInt(66, 80), spo2: randInt(96, 99) };
    rhythm.critical = false;
  }
}

/**
 * The trainee-facing scenario prompt for the treatment step. Pulse status is a
 * physical-exam finding the ECG can't show, so it is stated; stability must be
 * inferred from the displayed vitals (that inference is the skill under test).
 * @param {Scenario} sc
 * @returns {string}
 */
export function scenarioPrompt(sc) {
  return sc.pulse
    ? "Pulse present — what's your intervention? ↓"
    : "No palpable pulse — what's your first intervention? ↓";
}

/**
 * The correct ACLS intervention for a rhythm in a given scenario, with a concise
 * teaching rationale.
 * @param {string} rhythmId
 * @param {Scenario} sc
 * @returns {{txId: string, rationale: string}}
 */
export function treatmentFor(rhythmId, sc, rhythm = null, hr = null) {
  if (!sc.pulse) {
    if (rhythmId === "vf") {
      return { txId: "defibrillate", rationale: "Shockable arrest — defibrillate immediately, then resume CPR + epinephrine." };
    }
    if (rhythmId === "vt") {
      return { txId: "defibrillate", rationale: "Pulseless VT is shockable — defibrillate, then CPR." };
    }
    if (rhythmId === "torsades") {
      return { txId: "defibrillate", rationale: "Pulseless polymorphic VT/torsades — defibrillate immediately; magnesium and correction of QT-prolonging causes address recurrence." };
    }
    // asystole, PEA
    return { txId: "cpr_epi", rationale: "Non-shockable arrest — high-quality CPR + epinephrine and hunt the H's & T's; do NOT shock." };
  }

  const unstable = sc.stability === "unstable";
  switch (rhythmId) {
    case "vt":
      return unstable
        ? { txId: "cardiovert", rationale: "Wide-complex tachycardia with a pulse but unstable — synchronized cardioversion." }
        : { txId: "amiodarone", rationale: "Stable VT with a pulse — antiarrhythmic (amiodarone) and expert consult, not a shock." };
    case "torsades":
      return { txId: "defibrillate", rationale: "Sustained polymorphic VT cannot be reliably synchronized — deliver an immediate unsynchronized shock. For torsades with long QT, give magnesium and correct the cause to prevent recurrence." };
    case "svt":
      return unstable
        ? { txId: "cardiovert", rationale: "Unstable narrow-complex tachycardia — synchronized cardioversion." }
        : { txId: "adenosine", rationale: "Stable SVT — vagal maneuvers first, then adenosine." };
    case "afib":
    case "aflutter":
      if (unstable) {
        return { txId: "cardiovert", rationale: "Hemodynamic instability attributable to AF/flutter — synchronized cardioversion." };
      }
      // AF/flutter is not automatically a rate-control indication. The
      // ventricular response determines the acute question: slow → avoid
      // further AV-nodal blockade and find the cause; already controlled
      // (~60–100) → no acute rate-control drug is required; rapid (>100) →
      // rate control may be appropriate if otherwise stable and no
      // contraindication/pre-excitation is present.
      const slow = (hr != null && hr < 60) || (rhythm && /slow ventricular response/i.test(rhythm.name));
      const controlled = (hr != null && hr >= 60 && hr <= 100) || (rhythm && /Atrial Fibrillation$/.test(rhythm.name));
      if (slow) {
        return { txId: "treat_cause", rationale: "AF/flutter with a slow ventricular response — do not add AV-nodal blockers. Review AV-nodal-blocking drugs/toxins, conduction disease, ischemia, hypoxia and electrolytes; treat the cause and monitor." };
      }
      if (controlled) {
        return { txId: "monitor", rationale: "AF/flutter with a controlled ventricular response (~60–100 bpm) and stable perfusion — do not give rate-control medication merely because AF/flutter is present. Address triggers and consider rhythm-control/anticoagulation decisions separately." };
      }
      return { txId: "rate_control", rationale: "Stable AF/flutter with a rapid ventricular response — rate control can be appropriate when indicated, after checking for instability, pre-excited AF, contraindications and reversible triggers." };
    case "sbrady":
    case "junctional":
      return unstable
        ? { txId: "atropine", rationale: "Symptomatic bradycardia — atropine first line; pace if it fails." }
        : { txId: "monitor", rationale: "Asymptomatic and perfusing — monitor; no drug needed." };
    case "mobitz2":
    case "chb":
      return unstable
        ? { txId: "pacing", rationale: "High-grade block, symptomatic — transcutaneous pacing; atropine is unreliable in infranodal block." }
        : { txId: "monitor", rationale: "Perfusing high-grade block — monitor with pacer pads on and ready." };
    case "ivr":
      return unstable
        ? { txId: "pacing", rationale: "Symptomatic ventricular escape — pace; never suppress the escape rhythm." }
        : { txId: "monitor", rationale: "Perfusing idioventricular / AIVR — monitor; don't suppress the escape." };
    case "stach":
      return { txId: "treat_cause", rationale: "Sinus tach is a symptom — find and treat the cause (pain, hypovolemia, fever); don't cardiovert." };
    default:
      // nsr, avb1, mobitz1, pvc
      return { txId: "monitor", rationale: "No acute intervention indicated — monitor (and correct any reversible cause)." };
  }
}
