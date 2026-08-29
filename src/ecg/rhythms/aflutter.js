/**
 * Atrial Flutter (AFL).
 *
 * A rapid, organized atrial re-entry circuit fires at ~250-350/min, producing
 * the classic continuous "sawtooth" baseline of flutter (F) waves. The AV node
 * conducts only every Nth flutter wave at a FIXED ratio (2:1, 3:1, or 4:1),
 * yielding a REGULAR narrow-complex ventricular response (e.g. 2:1 of 300 =
 * 150/min). Perfusing rhythm.
 *
 * Built with the two-independent-clock pattern (see chb.js): a fast flutter
 * clock lays down regular F-waves, and a ventricular clock — locked to an
 * integer multiple of the flutter interval — emits a narrow QRST every `ratio`
 * flutter events. Each nextBeat() emits whichever pending event is sooner and
 * advances only that clock, guaranteeing monotonic tR.
 */

import { NORMAL_BEAT, jitterBeat } from "../waveform.js";
import { randRange, choice } from "./util.js";

/** Narrow conducted complex (QRST with no P wave — atria are in flutter). */
const NARROW_QRST = NORMAL_BEAT.filter((w) => w.name !== "P");

/**
 * Create an Atrial Flutter rhythm generator.
 *
 * @param {Object} [opts] Optional overrides (otherwise self-randomized).
 * @param {number} [opts.atrialRate] Flutter (F-wave) rate in bpm (default: random 250-350).
 * @param {number} [opts.ratio] Fixed AV conduction ratio, one of 2/3/4 (default: random).
 * @returns {import("../rhythm.js").Rhythm} Atrial flutter rhythm object.
 */
export function createAFlutter(opts = {}) {
  const atrialRate = opts.atrialRate ?? randRange(250, 350);
  const ratio = opts.ratio ?? choice([2, 3, 4]);
  const flutterInterval = 60 / atrialRate;
  const ventInterval = ratio * flutterInterval;

  // Sawtooth F-wave morphology: small, sharp, single-hump per flutter event.
  const fAmp = -randRange(0.08, 0.16);
  const fWave = [{ name: "F", offset: 0, amp: fAmp, sigma: 0.028 }];

  // Two independent clocks. The ventricular clock is a fixed integer multiple
  // of the flutter interval, so conducted QRS complexes stay phase-locked to
  // the sawtooth and the ventricular response is regular.
  let nextF = 0;
  let nextV = 0;

  return {
    name: "Atrial Flutter",
    label: "AFL",
    vitals: {
      sys: randRange(108, 125),
      dia: randRange(70, 82),
      spo2: randRange(96, 98),
    },
    nextBeat() {
      // Emit the sooner event; ties resolve to the QRS so it is never starved.
      if (nextV <= nextF) {
        const tR = nextV;
        nextV += ventInterval * (1 + (Math.random() * 2 - 1) * 0.01);
        return { tR, waves: jitterBeat(NARROW_QRST), isVentricular: true };
      }
      const tR = nextF;
      nextF += flutterInterval * (1 + (Math.random() * 2 - 1) * 0.01);
      return { tR, waves: jitterBeat(fWave), isVentricular: false };
    },
  };
}
