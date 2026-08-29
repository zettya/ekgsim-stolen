# EKGSim — Scratch / Roadmap

Paramedic dysrhythmia-practice cardiac monitor. Web app, zero build step
(ES modules + Canvas). Served statically.

## Run it
```
cd /home/ais/projects/EKGSim
python3 -m http.server 8137
# open http://localhost:8137/
```
(ES modules require http:// — opening index.html via file:// will not load.)

## Architecture (the anti-"weeds" design)
- **Beat = sum of Gaussians** (P,Q,R,S,T), one shared cardiac timeline.
  `src/ecg/waveform.js`
- **Leads = per-wave projection coefficients** off the Lead II reference.
  Makes 12-lead a data change, not an engine change. `src/ecg/leads.js`
- **Rhythm = stateful generator** emitting scheduled beats; HR derived from
  real R-R. `src/ecg/rhythm.js`
- **Renderer = calibrated sweep** (25 mm/s, 10 mm/mV, real mm grid, erase bar).
  `src/monitor/renderer.js`
- **Vitals** HR / NIBP-with-recycle / SpO2. `src/monitor/vitals.js`
- Procedural variety = jitter parameters within physiologic ranges, NOT
  open-ended randomness. Bounded + realistic + never-identical.

## Status
- [x] Phase 0 — calibrated monitor, NSR, Lead II + III, HR, NIBP recycle.
      Verified: headless smoke test + screenshot.
- [x] Phase 1a — high-yield set proved the pipeline: AFib, VT, VF, 3° AV
      block, asystole. Built by a draft→adversarial-verify workflow swarm
      (sonnet drafts, opus verifies vs signature harness + self-repairs).
      All 5 pass `scripts/summary.mjs` and were screenshot-verified.
      Selector: ‹ › step + RANDOM; deep-link via #<id>.
- [x] Phase 1b — mop-up (12 more via the same swarm): sinus brady, sinus tach,
      A-flutter, SVT, 1° block, Mobitz I & II, junctional, idioventricular,
      PVCs, torsades, PEA. Library now 18 rhythms; all pass scripts/summary.mjs.
      Verifiers fixed rate-dependent T/QRS collision (ST, SVT) via Bazett QT
      shortening, and inverted-polarity detection issues (PVC).
- [x] Phase 1c — monitor polish: selectable leads per lane (I/II/III/aVR/aVL/
      aVF/MCL1), audible QRS tone (Web Audio, pitch tracks SpO2, sound toggle),
      alarm states (crit/warn banner + red HR; CHECK PULSE for non-perfusing,
      UNSTABLE for critical rhythms), VF coarse/fine + AFib RVR/controlled/slow
      variants. Screenshot-verified.
- [x] Phase 1d — refinement pass (Fable). Shared-lead baseline artifact (both
      lanes = one patient, scaled by lead gain); CHB dissociated-P march made
      visible + escape span raised; NSR vitals randomized; TdP rebuilt as a
      rotating-vector twist (quadrature lobe fills the nodes → accordion, not a
      scale-and-flip staircase); rate-coupled perfusion vitals (ratePerfusion)
      on NSR/SB/ST/SVT; junctional retrograde P now before/buried/after.
      All 18 still pass scripts/summary.mjs.
- [x] Phase 2 — practice/quiz mode. 🎯 QUIZ toggle hides the rhythm name (and
      strips the label from alarms so they don't give it away), loads a random
      mystery rhythm, and shows a family-grouped 18-answer bank. Immediate
      reveal with a key-feature blurb; running streak / best / accuracy.
      Endless practice; NEXT loads a fresh rhythm with a clean full-screen
      trace. Quiz logic covered by a headless DOM-stub test.
- [x] Phase 2b — ACLS treatment step (two-phase rounds). Each round draws a
      clinical scenario (pulse present? stable/unstable?) that VARIES for
      pulse-dependent rhythms (VT: pulseless/unstable/stable; SVT/AFib/AFL &
      bradys: stable/unstable; TdP: pulseless/with-pulse) and overlays matching
      vitals on the monitor. After naming the rhythm the trainee picks the ACLS
      intervention from an 11-option bank (Electricity/Medication/Supportive);
      correct answer is computed from (rhythm, scenario) — e.g. VT→defibrillate
      / cardiovert / amiodarone. Answers stay at the decision level (no doses/
      joules). Dual scoring: rhythm acc + treatment acc + both-right streak.
      `src/quiz/acls.js` holds the scenario+treatment domain; 43-assertion
      headless test. Pulse status is stated (exam finding); stability must be
      read off the displayed vitals (the skill under test).
- [ ] Phase 3 — true lead projection (cardiac vector) + full 12-lead view;
      artifact/noise realism; waveform calipers.

## Notes
- "4-lead" (EMS) = limb leads I/II/III via RA/LA/LL/RL; precordial V1-V6 = 12-lead.
  Default display: II + III.
- DeepSeek tiers still not invokable (deepseek-usage MCP = metrics only).
- README.md written (overview, quick start, capabilities, architecture, quirks)
  with screenshots in docs/ (monitor, torsades accordion, quiz treatment step).
- Private GitHub repo: github.com/aschanken/EKGSim (branch master).
- Headless pixel verification available: playwright-core (global) driving the
  existing ms-playwright chromium via executablePath. Scripts live in the job
  scratch dir (NOT committed). This caught the .quiz[hidden] display bug that
  the DOM-stub logic tests couldn't. 40-round live consistency check passed
  (scenario vitals ↔ correct treatment always agree).
