/**
 * Monitor bootstrap: wires the ECG engine, two selectable lead lanes, the
 * vitals panel, QRS audio, and alarm evaluation into one animation loop driven
 * by a shared cardiac timeline.
 */

import { EcgEngine } from "./ecg/rhythm.js";
import { RHYTHMS, randomRhythm } from "./ecg/rhythms/index.js";
import { LEADS, LEAD_IDS } from "./ecg/leads.js";
import { LeadLane } from "./monitor/renderer.js";
import { Vitals } from "./monitor/vitals.js";
import { MonitorAudio } from "./monitor/audio.js";
import { DefibPanel } from "./monitor/defib.js";
import { Quiz } from "./quiz/quiz.js";
import { pickScenario, applyScenario, treatmentFor, scenarioPrompt } from "./quiz/acls.js";

const engine = new EcgEngine(RHYTHMS[0].make());
let rhythmIndex = 0;

const lane1 = new LeadLane(document.getElementById("lane1"), LEADS.II);
const lane2 = new LeadLane(document.getElementById("lane2"), LEADS.III);
const lanes = [lane1, lane2];

const vitals = new Vitals({
  hr: document.getElementById("hr"),
  bp: document.getElementById("bp"),
  bpNote: document.getElementById("bp-note"),
  spo2: document.getElementById("spo2"),
});

const audio = new MonitorAudio();
const rhythmLabel = document.getElementById("rhythm-label");
const alarmEl = document.getElementById("alarm");
const hrEl = document.getElementById("hr");

/** Shared timeline position, in seconds. */
let signalTime = 0;
/** Fractional column accumulator, so sweep speed is frame-rate independent. */
let colAcc = 0;
/** Latest ventricular R-peak time already sounded, to beep each QRS once. */
let lastBeepAt = 0;
/** Whether practice/quiz mode is active (rhythm name hidden). */
let quizMode = false;

// --- Lead selectors -------------------------------------------------------

/** Populate a <select> with the available leads and select `current`. */
function fillLeadSelect(el, currentId) {
  el.innerHTML = "";
  for (const id of LEAD_IDS) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = LEADS[id].label;
    el.appendChild(opt);
  }
  el.value = currentId;
}

const sel1 = document.getElementById("lead1");
const sel2 = document.getElementById("lead2");
fillLeadSelect(sel1, "II");
fillLeadSelect(sel2, "III");
sel1.addEventListener("change", () => lane1.setLead(LEADS[sel1.value]));
sel2.addEventListener("change", () => lane2.setLead(LEADS[sel2.value]));

// --- Rhythm selection -----------------------------------------------------

/**
 * Install a rhythm: reset the timeline so it starts cleanly, and refresh the
 * label and baseline vitals.
 * @param {import("./ecg/rhythm.js").Rhythm} rhythm
 */
function applyRhythm(rhythm) {
  engine.setRhythm(rhythm);
  engine.reset();
  signalTime = 0;
  colAcc = 0;
  lastBeepAt = signalTime;
  vitals.setBaseline(rhythm.vitals);
  // In practice mode the name is the answer — keep it hidden until the trainee
  // has guessed and the round is revealed.
  rhythmLabel.textContent = quizMode ? "? ? ?" : rhythm.name;
}

/** Step through the registry (dir = +1 / -1). */
function step(dir) {
  rhythmIndex = (rhythmIndex + dir + RHYTHMS.length) % RHYTHMS.length;
  applyRhythm(RHYTHMS[rhythmIndex].make());
}

document.getElementById("prev").addEventListener("click", () => step(-1));
document.getElementById("next").addEventListener("click", () => step(1));
document.getElementById("random").addEventListener("click", () => {
  rhythmIndex = Math.floor(Math.random() * RHYTHMS.length);
  applyRhythm(randomRhythm());
});
document
  .getElementById("nibp-panel")
  .addEventListener("click", () => vitals.recycle());

const audioSettingsToggle = document.getElementById("audio-settings-toggle");
const audioSettings = document.getElementById("audio-settings");
const audioMasterBtn = document.getElementById("audio-master");
const audioQrsBtn = document.getElementById("audio-qrs");
const audioAlarmsBtn = document.getElementById("audio-alarms");
const audioDefibBtn = document.getElementById("audio-defib");

function renderAudioSettings() {
  const masterOn = audio.enabled || audio.alarmEnabled || audio.defibEnabled;
  audioMasterBtn.textContent = masterOn ? "MASTER ON" : "MASTER OFF";
  audioMasterBtn.classList.toggle("accent", masterOn);
  audioQrsBtn.textContent = audio.enabled ? "QRS ON" : "QRS OFF";
  audioQrsBtn.classList.toggle("accent", audio.enabled);
  audioAlarmsBtn.textContent = audio.alarmEnabled ? "ALARMS ON" : "ALARMS OFF";
  audioAlarmsBtn.classList.toggle("accent", audio.alarmEnabled);
  audioDefibBtn.textContent = audio.defibEnabled ? "DEFIB ON" : "DEFIB OFF";
  audioDefibBtn.classList.toggle("accent", audio.defibEnabled);
  audioSettingsToggle.textContent = masterOn ? "🔊 AUDIO" : "🔇 AUDIO";
}

audioSettingsToggle?.addEventListener("click", () => {
  audioSettings.hidden = !audioSettings.hidden;
  audioSettingsToggle.setAttribute("aria-expanded", String(!audioSettings.hidden));
});
audioMasterBtn?.addEventListener("click", () => {
  const on = !(audio.enabled && audio.alarmEnabled && audio.defibEnabled);
  if (on) {
    audio.ensureContext();
    audio.enabled = true;
    audio.alarmEnabled = true;
    audio.defibEnabled = true;
  } else {
    audio.enabled = false;
    audio.alarmEnabled = false;
    audio.defibEnabled = false;
    audio.stopChargeTone();
  }
  renderAudioSettings();
});
audioQrsBtn?.addEventListener("click", () => { audio.toggle(); renderAudioSettings(); });
audioAlarmsBtn?.addEventListener("click", () => { audio.toggleAlarms(); renderAudioSettings(); });
audioDefibBtn?.addEventListener("click", () => { audio.toggleDefib(); renderAudioSettings(); });
renderAudioSettings();

// --- Manual patient vitals -----------------------------------------------
const vitalsSettingsToggle = document.getElementById("vitals-settings-toggle");
const vitalsSettings = document.getElementById("vitals-settings");
const vitalHr = document.getElementById("vital-hr");
const vitalSys = document.getElementById("vital-sys");
const vitalDia = document.getElementById("vital-dia");
const vitalSpo2 = document.getElementById("vital-spo2");
const vitalsApply = document.getElementById("vitals-apply");
const vitalsClear = document.getElementById("vitals-clear");

vitalsSettingsToggle?.addEventListener("click", () => {
  vitalsSettings.hidden = !vitalsSettings.hidden;
  vitalsSettingsToggle.setAttribute("aria-expanded", String(!vitalsSettings.hidden));
  if (!vitalsSettings.hidden) {
    const currentHr = vitals.getHeartRate(engine.heartRate(signalTime));
    const base = vitals.manual ?? vitals.baseline;
    vitalHr.value = String(currentHr);
    vitalSys.value = String(base.sys);
    vitalDia.value = String(base.dia);
    vitalSpo2.value = String(base.spo2);
  }
});
vitalsApply?.addEventListener("click", () => {
  const hr = Math.max(0, Math.min(300, Number(vitalHr.value) || 0));
  const sys = Math.max(0, Math.min(300, Number(vitalSys.value) || 0));
  const dia = Math.max(0, Math.min(200, Number(vitalDia.value) || 0));
  const spo2 = Math.max(0, Math.min(100, Number(vitalSpo2.value) || 0));
  vitals.setManual({ hr, sys, dia, spo2 });
});
vitalsClear?.addEventListener("click", () => { vitals.clearManual(); });

// --- Practice / quiz mode -------------------------------------------------

/** Id of the last mystery rhythm, to avoid loading the same one back-to-back. */
let quizLastId = null;

/**
 * Load a fresh mystery rhythm with a randomized clinical scenario, install it on
 * the monitor, and return the round facts (correct rhythm + correct treatment +
 * scenario prompt) for the quiz to score against.
 * @returns {{rhythmId: string, correctTxId: string, txRationale: string, scenarioPrompt: string}}
 */
function quizNewRound() {
  let i;
  do {
    i = Math.floor(Math.random() * RHYTHMS.length);
  } while (RHYTHMS.length > 1 && RHYTHMS[i].id === quizLastId);
  quizLastId = RHYTHMS[i].id;
  rhythmIndex = i;

  const entry = RHYTHMS[i];
  const scenario = pickScenario(entry.id);
  const rhythm = entry.make();
  applyScenario(rhythm, scenario); // overlay pulse/stability onto the vitals
  applyRhythm(rhythm);
  refillLanes();

  const currentHr = engine.heartRate(signalTime);
  const tx = treatmentFor(entry.id, scenario, rhythm, currentHr);
  return {
    rhythmId: entry.id,
    correctTxId: tx.txId,
    txRationale: tx.rationale,
    scenarioPrompt: scenarioPrompt(scenario),
  };
}

const quiz = new Quiz(
  {
    prompt: document.getElementById("q-prompt"),
    grid: document.getElementById("q-grid"),
    revealRhythm: document.getElementById("q-reveal-rhythm"),
    revealTx: document.getElementById("q-reveal-tx"),
    next: document.getElementById("q-next"),
    streak: document.getElementById("q-streak"),
    best: document.getElementById("q-best"),
    rhythmAcc: document.getElementById("q-rhythm-acc"),
    txAcc: document.getElementById("q-tx-acc"),
  },
  { onNewRound: quizNewRound },
);

const quizToggle = document.getElementById("quiz-toggle");
const quizPanel = document.getElementById("quiz");
const browseControls = document.querySelector(".browse-controls");

/** Enter or leave practice mode. */
function setQuizMode(on) {
  quizMode = on;
  quizToggle.setAttribute("aria-pressed", String(on));
  quizToggle.classList.toggle("accent", on);
  quizPanel.hidden = !on;
  browseControls.hidden = on;
  if (on) {
    setDefibMode(false);
    setLearnMode(false);
    quiz.reset();
    quiz.newRound(); // loads a mystery rhythm and refills the lanes
  } else {
    // Reveal the current rhythm and reclaim the space the dock occupied.
    rhythmLabel.textContent = engine.rhythm.name;
    refillLanes();
  }
}
quizToggle.addEventListener("click", () => setQuizMode(!quizMode));

// --- Defibrillator panel ---------------------------------------------------

/** Rhythms without a reliable synchronization target — SYNC mode can't fire on these. */
const NOT_ORGANIZED = new Set(["vf", "asystole", "torsades"]);
/** Organized tachyarrhythmias-with-a-pulse that synchronized cardioversion actually treats. */
const CARDIOVERTIBLE = new Set(["afib", "aflutter", "svt", "vt"]);

/** Swap the live rhythm to a named registry id (used for shock outcomes) and refresh the lanes. */
function jumpToRhythm(id) {
  const idx = RHYTHMS.findIndex((r) => r.id === id);
  if (idx < 0) return;
  rhythmIndex = idx;
  applyRhythm(RHYTHMS[idx].make());
  refillLanes();
}

/**
 * Decide what a delivered shock does to the current patient. Kept here (not
 * in defib.js) because it needs the live engine/rhythm state.
 * @param {number} energyJ
 * @param {boolean} syncOn
 * @returns {{message: string, kind: "ok"|"warn"|"bad"}}
 */
function handleShock(energyJ, syncOn) {
  const id = RHYTHMS[rhythmIndex].id;
  const pulseless = engine.rhythm.vitals.sys <= 0;

  if (pulseless) {
    if (id === "vf" || id === "vt" || id === "torsades") {
      jumpToRhythm("nsr");
      return {
        message: `Defibrillation successful (${energyJ} J) — organized rhythm restored (simulated ROSC). Continue post-arrest care.`,
        kind: "ok",
      };
    }
    return {
      message:
        "Non-shockable rhythm — defibrillation isn't indicated here. Resume CPR + epinephrine and hunt the H's & T's; a shock doesn't help asystole/PEA and only interrupts compressions.",
      kind: "bad",
    };
  }

  if (syncOn) {
    if (CARDIOVERTIBLE.has(id)) {
      jumpToRhythm("nsr");
      return {
        message: `Synchronized cardioversion successful (${energyJ} J) — sinus rhythm restored.`,
        kind: "ok",
      };
    }
    return {
      message:
        "Cardioversion isn't indicated here — this isn't a shockable tachyarrhythmia with a pulse. Consider pacing for a slow rhythm, or no electrical therapy at all for a benign one.",
      kind: "warn",
    };
  }

  // Unsynchronized shock on a rhythm that still has a pulse — R-on-T risk.
  jumpToRhythm("vf");
  return {
    message:
      "⚠ Unsynchronized shock landed during repolarization (R-on-T) — induced VF. Always enable SYNC before shocking a rhythm with a pulse.",
    kind: "bad",
  };
}

const PACING_ELIGIBLE = new Set(["sbrady", "junctional", "ivr", "mobitz2", "chb"]);
let pacingSource = null;

function makePacedRhythm(rate) {
  const rr = 60 / rate;
  let t = 0;
  return {
    name: "Ventricular Paced Rhythm", label: "V-PACED",
    vitals: { sys: 108, dia: 68, spo2: 97 },
    nextBeat() {
      const beat = { tR: t, waves: [
        { name: "pace", offset: -0.055, amp: 0.9, sigma: 0.004 },
        { name: "Q", offset: -0.025, amp: -0.18, sigma: 0.016 },
        { name: "R", offset: 0, amp: 1.0, sigma: 0.03 },
        { name: "S", offset: 0.045, amp: -0.3, sigma: 0.02 },
        { name: "T", offset: 0.28, amp: 0.25, sigma: 0.075 },
      ] };
      t += rr;
      return beat;
    },
  };
}

function stopPacingRestoreSource() {
  if (!pacingSource) return;
  const sourceId = pacingSource;
  pacingSource = null;
  jumpToRhythm(sourceId);
}

function handlePacing(rate, output, active) {
  if (!active) {
    stopPacingRestoreSource();
    return { accepted: true, message: "Transcutaneous pacing stopped — underlying rhythm restored in the simulator.", kind: "warn" };
  }

  const id = RHYTHMS[rhythmIndex].id;
  const hr = engine.heartRate(signalTime);

  if (id === "vf" || id === "vt" || id === "torsades") {
    return { accepted: false, message: "⚠ PACING NOT APPROPRIATE: this is a shockable ventricular rhythm. Defibrillate (unsynchronized) and resume CPR if pulseless; sustained polymorphic VT also requires an unsynchronized shock.", kind: "bad" };
  }
  if (id === "asystole" || id === "pea") {
    return { accepted: false, message: "⚠ PACING NOT APPROPRIATE: this is a non-shockable cardiac-arrest rhythm. Resume high-quality CPR + epinephrine and actively treat the H's & T's; do not replace the rhythm with a paced rhythm.", kind: "bad" };
  }
  if (id === "afib" || id === "aflutter" || id === "svt" || id === "stach" || id === "nsr" || id === "avb1" || id === "mobitz1" || id === "pvc") {
    return { accepted: false, message: "⚠ PACING NOT INDICATED for this rhythm as currently presented. Treat the underlying rhythm/cause; if clinically significant bradycardia is present, use the bradycardia algorithm and pace when indicated.", kind: "warn" };
  }
  if (!PACING_ELIGIBLE.has(id)) {
    return { accepted: false, message: "⚠ No pacing capture simulated for this rhythm. Reassess the rhythm and follow the appropriate ACLS pathway.", kind: "warn" };
  }
  if (hr >= rate && id !== "chb") {
    return { accepted: false, message: `Pacing stimulus at ${rate} ppm is not above the current ventricular rate (~${hr} bpm). Increase the pacing rate only when clinically indicated and reassess capture.`, kind: "warn" };
  }
  if (output < 60) {
    return { accepted: false, message: `Pacing stimulus delivered at ${rate} ppm / ${output} mA, but no electrical capture — increase output and reassess electrical and mechanical capture.`, kind: "warn" };
  }

  pacingSource = id;
  engine.setRhythm(makePacedRhythm(rate));
  engine.reset();
  signalTime = 0;
  colAcc = 0;
  lastBeepAt = 0;
  vitals.setBaseline(engine.rhythm.vitals);
  rhythmLabel.textContent = quizMode ? "? ? ?" : engine.rhythm.name;
  refillLanes();
  return { accepted: true, message: `Electrical capture simulated at ${rate} ppm / ${output} mA — pacing spikes precede paced QRS complexes. Confirm mechanical capture clinically.`, kind: "ok" };
}

const paceOutputEl = document.getElementById("pace-output");
const paceOutputValueEl = document.getElementById("pace-output-value");
paceOutputEl?.addEventListener("input", () => {
  if (paceOutputValueEl) paceOutputValueEl.textContent = paceOutputEl.value;
  const status = document.getElementById("pace-status");
  const rate = Number(document.getElementById("pace-rate")?.value ?? 70);
  if (status && document.getElementById("defib-pace")?.getAttribute("aria-pressed") === "true") {
    status.textContent = `PACING ON · ${rate} ppm · ${paceOutputEl.value} mA`;
  }
});
document.getElementById("pace-rate")?.addEventListener("change", () => {
  const status = document.getElementById("pace-status");
  if (status && document.getElementById("defib-pace")?.getAttribute("aria-pressed") === "true") {
    status.textContent = `PACING ON · ${document.getElementById("pace-rate").value} ppm · ${paceOutputEl?.value ?? 70} mA`;
  }
});

const defib = new DefibPanel(
  {
    energyButtons: document.querySelectorAll("#defib-energy .energy-btn"),
    syncBtn: document.getElementById("defib-sync"),
    chargeBtn: document.getElementById("defib-charge"),
    shockBtn: document.getElementById("defib-shock"),
    disarmBtn: document.getElementById("defib-disarm"),
    paceBtn: document.getElementById("defib-pace"),
    paceRate: document.getElementById("pace-rate"),
    paceOutput: document.getElementById("pace-output"),
    paceStatus: document.getElementById("pace-status"),
    status: document.getElementById("defib-status"),
    message: document.getElementById("defib-message"),
    flash: document.getElementById("shock-flash"),
  },
  {
    audio,
    hasOrganizedQrs: () => !NOT_ORGANIZED.has(RHYTHMS[rhythmIndex].id),
    onShock: handleShock,
    onPacing: handlePacing,
  },
);

// --- Panel switching (Quiz / Defib / Learn are mutually exclusive) --------

const defibToggle = document.getElementById("defib-toggle");
const defibPanel = document.getElementById("defib");
const learnToggle = document.getElementById("learn-toggle");
const learnPanel = document.getElementById("learn");
const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings");
const settingsClose = document.getElementById("settings-close");
const creditsToggle = document.getElementById("credits-toggle");
const creditsPanel = document.getElementById("credits");
const creditsClose = document.getElementById("credits-close");

// --- Display themes -------------------------------------------------------
// Keep this deliberately small: one preset changes the monitor and normal HUD
// accent without requiring a separate settings module.
const THEMES = {
  green: {
    green: "#25f58a", monitorBg: "#04120a", grid: "rgba(0, 90, 40, 0.35)",
    gridMajor: "rgba(0, 140, 70, 0.55)", waveform: "#25f58a", glow: "rgba(37, 245, 138, 0.6)",
  },
  amber: {
    green: "#ffb648", monitorBg: "#100b03", grid: "rgba(120, 75, 10, 0.32)",
    gridMajor: "rgba(180, 110, 20, 0.52)", waveform: "#ffb648", glow: "rgba(255, 182, 72, 0.55)",
  },
  blue: {
    green: "#55b8ff", monitorBg: "#040b12", grid: "rgba(25, 90, 135, 0.32)",
    gridMajor: "rgba(45, 125, 185, 0.52)", waveform: "#55b8ff", glow: "rgba(85, 184, 255, 0.55)",
  },
  pink: {
    green: "#ff72c6", monitorBg: "#10050b", grid: "rgba(120, 35, 85, 0.32)",
    gridMajor: "rgba(180, 55, 125, 0.52)", waveform: "#ff72c6", glow: "rgba(255, 114, 198, 0.55)",
  },
  white: {
    green: "#f0f4f7", monitorBg: "#090b0d", grid: "rgba(120, 130, 140, 0.28)",
    gridMajor: "rgba(170, 180, 190, 0.45)", waveform: "#f0f4f7", glow: "rgba(240, 244, 247, 0.45)",
  },
};

function applyTheme(name, save = true) {
  const theme = THEMES[name] || THEMES.green;
  const root = document.documentElement;
  root.style.setProperty("--green", theme.green);
  root.style.setProperty("--monitor-bg", theme.monitorBg);
  root.style.setProperty("--monitor-grid", theme.grid);
  root.style.setProperty("--monitor-grid-major", theme.gridMajor);
  root.style.setProperty("--monitor-waveform", theme.waveform);
  root.style.setProperty("--monitor-glow", theme.glow);
  for (const lane of lanes) lane.refreshTheme();
  document.querySelectorAll(".theme-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.theme === name);
  });
  if (save) localStorage.setItem("ekgsim-theme", name);
}

const savedTheme = localStorage.getItem("ekgsim-theme") || "green";
applyTheme(savedTheme, false);
document.querySelectorAll(".theme-btn").forEach((btn) => {
  btn.addEventListener("click", () => applyTheme(btn.dataset.theme));
});

function closeAuxPanels() {
  settingsPanel.hidden = true;
  creditsPanel.hidden = true;
  settingsToggle?.setAttribute("aria-expanded", "false");
  creditsToggle?.setAttribute("aria-pressed", "false");
}

settingsToggle?.addEventListener("click", () => {
  const open = settingsPanel.hidden;
  closeAuxPanels();
  settingsPanel.hidden = !open;
  settingsToggle.setAttribute("aria-expanded", String(open));
});
settingsClose?.addEventListener("click", closeAuxPanels);
creditsToggle?.addEventListener("click", () => {
  const open = creditsPanel.hidden;
  closeAuxPanels();
  creditsPanel.hidden = !open;
  creditsToggle.setAttribute("aria-pressed", String(open));
});
creditsClose?.addEventListener("click", closeAuxPanels);


function setDefibMode(on) {
  defibToggle.setAttribute("aria-pressed", String(on));
  defibToggle.classList.toggle("accent", on);
  defibPanel.hidden = !on;
  if (on) {
    if (quizMode) setQuizMode(false);
    setLearnMode(false);
  }
}

function setLearnMode(on) {
  learnToggle.setAttribute("aria-pressed", String(on));
  learnToggle.classList.toggle("accent", on);
  learnPanel.hidden = !on;
  if (on) {
    if (quizMode) setQuizMode(false);
    setDefibMode(false);
  }
}

defibToggle.addEventListener("click", () => setDefibMode(defibPanel.hidden));
learnToggle.addEventListener("click", () => setLearnMode(learnPanel.hidden));

// The learn/quiz/defib docks change the available height of the waveform screen.
// ResizeObserver keeps the canvas backing buffers in sync, preventing the trace
// from visually overlapping the dock when a panel opens.
const screenEl = document.querySelector(".screen");
if (screenEl && typeof ResizeObserver !== "undefined") {
  const screenObserver = new ResizeObserver(() => {
    for (const lane of lanes) lane.resize();
    warmup();
  });
  screenObserver.observe(screenEl);
}

// Optional deep-link: #<id> (e.g. #vt) selects a rhythm on load.
const hashId = location.hash.replace("#", "");
const hashIdx = RHYTHMS.findIndex((r) => r.id === hashId);
if (hashIdx >= 0) rhythmIndex = hashIdx;
applyRhythm(RHYTHMS[rhythmIndex].make());

// --- Alarms ---------------------------------------------------------------

/**
 * Evaluate the current alarm condition from the rhythm and heart rate.
 * @param {import("./ecg/rhythm.js").Rhythm} rhythm
 * @param {number} hr
 * @param {boolean} quiet  Practice mode: suppress the perfusion/stability alarms
 *   (CHECK PULSE / UNSTABLE) and their red HR so the monitor never labels the
 *   patient for the trainee — stability must be read off the vitals. Rate
 *   warnings stay; they only restate the HR and don't reveal stable vs unstable.
 * @returns {{level: string, text: string}|null}
 */
function evalAlarm(rhythm, hr, quiet) {
  if (!quiet) {
    if (rhythm.vitals.sys <= 0) return { level: "crit", text: `${rhythm.label} · CHECK PULSE` };
    if (rhythm.critical) return { level: "crit", text: `${rhythm.label} · UNSTABLE` };
  }
  if (hr > 0 && hr < 50) return { level: "warn", text: `BRADYCARDIA · HR ${hr}` };
  if (hr > 150) return { level: "warn", text: `TACHYCARDIA · HR ${hr}` };
  return null;
}

/** Reflect an alarm condition in the banner and the HR readout colour. */
function renderAlarm(alarm) {
  if (!alarm) {
    alarmEl.hidden = true;
    hrEl.classList.remove("alarm-crit", "alarm-warn");
    return;
  }
  alarmEl.hidden = false;
  alarmEl.textContent = alarm.text;
  alarmEl.className = `alarm ${alarm.level}`;
  hrEl.classList.toggle("alarm-crit", alarm.level === "crit");
  hrEl.classList.toggle("alarm-warn", alarm.level === "warn");
}

// --- Animation loop -------------------------------------------------------

/**
 * Advance the timeline by `n` columns, pushing one fresh sample per column
 * into every lane (all leads sampled at the same instant).
 * @param {number} n
 */
function pushColumns(n) {
  const stepSec = 1 / lane1.pxPerSec;
  for (let i = 0; i < n; i++) {
    signalTime += stepSec;
    for (const lane of lanes) lane.push(engine.sample(signalTime, lane.lead));
  }
}

/** Sound one tone per ventricular QRS that has just passed under the cursor. */
function soundQrs() {
  const freq = MonitorAudio.freqForSpo2(engine.rhythm.vitals.spo2);
  for (const b of engine.beats) {
    if (b.isVentricular !== false && b.tR > lastBeepAt && b.tR <= signalTime) {
      audio.beep(freq);
      lastBeepAt = b.tR;
    }
  }
}

/** Fill each lane's buffer so the screen isn't blank on first paint. */
function warmup() {
  pushColumns(lane1.samples.length);
  lastBeepAt = signalTime; // don't replay the warmed-in beats as a burst
}

/**
 * Re-measure the lanes (their height changes when the quiz dock shows/hides)
 * and refill their buffers so the trace immediately fills the new size.
 */
function refillLanes() {
  for (const lane of lanes) lane.resize();
  warmup();
}

let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1; // avoid huge catch-up after the tab was hidden

  colAcc += lane1.pxPerSec * dt;
  const n = Math.floor(colAcc);
  colAcc -= n;
  if (n > 0) pushColumns(n);

  soundQrs();
  for (const lane of lanes) lane.render();

  const nativeHr = engine.heartRate(signalTime);
  const hr = vitals.getHeartRate(nativeHr);
  vitals.update(dt, nativeHr);
  const alarm = evalAlarm(engine.rhythm, hr, quizMode);
  renderAlarm(alarm);
  if (alarm?.level === "crit") audio.critAlarm(signalTime);
  else if (alarm?.level === "warn") audio.warnAlarm(signalTime);

  requestAnimationFrame(frame);
}

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    for (const lane of lanes) lane.resize();
    warmup();
  }, 120);
});

warmup();
requestAnimationFrame(frame);
