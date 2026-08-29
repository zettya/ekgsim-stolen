/**
 * Calibrated sweep renderer for one ECG lead lane.
 *
 * Fidelity comes from honoring the real ECG spatial standard:
 *   - horizontal: 25 mm/s sweep speed
 *   - vertical:   10 mm/mV gain
 *   - small square = 1 mm = 40 ms x 0.1 mV; large square = 5 mm.
 *
 * Rendering uses the classic monitor "sweep": a write cursor advances left to
 * right, laying down new samples, with a short blanking gap just ahead of it so
 * you see the bright leading edge erase the old trace.
 */

/** ECG paper speed, millimetres per second. */
const MM_PER_SEC = 25;
/** ECG gain, millimetres per millivolt. */
const MM_PER_MV = 10;

export class LeadLane {
  /**
   * @param {HTMLCanvasElement} canvas  Target canvas element.
   * @param {{label: string, coef: Object}} lead  Lead profile to render.
   */
  constructor(canvas, lead) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.lead = lead;
    this.grid = document.createElement("canvas");
    this.gridCtx = this.grid.getContext("2d");
    /** @type {Float32Array} */
    this.samples = new Float32Array(1);
    this.writeCol = 0;
    this.pxPerMm = 6;
    this.resize();
  }

  /** Change which lead this lane displays. */
  setLead(lead) {
    this.lead = lead;
  }

  /** Device pixels swept per second of signal. */
  get pxPerSec() {
    return MM_PER_SEC * this.pxPerMm;
  }

  /**
   * Recompute internal resolution and rebuild the cached grid. Call on load
   * and whenever the element is resized.
   */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.canvas.clientWidth || 600;
    const cssH = this.canvas.clientHeight || 160;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    this.canvas.width = w;
    this.canvas.height = h;
    this.grid.width = w;
    this.grid.height = h;
    // Scale so ~28 mm of vertical range fits the lane.
    this.pxPerMm = h / 28;
    this.baselineY = h * 0.62; // baseline sits low; R waves rise into space above
    this.samples = new Float32Array(w);
    this.writeCol = 0;
    this._buildGrid();
  }

  /** Rebuild the cached grid after a display-theme change. */
  refreshTheme() {
    this._buildGrid();
  }

  /** Pre-render the calibration grid to an offscreen canvas. */
  _buildGrid() {
    const g = this.gridCtx;
    const w = this.grid.width;
    const h = this.grid.height;
    const mm = this.pxPerMm;
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement);
    const monitorBg = css.getPropertyValue("--monitor-bg").trim() || "#04120a";
    const gridColor = css.getPropertyValue("--monitor-grid").trim() || "rgba(0, 90, 40, 0.35)";
    const gridMajorColor = css.getPropertyValue("--monitor-grid-major").trim() || "rgba(0, 140, 70, 0.55)";
    const waveformColor = css.getPropertyValue("--monitor-waveform").trim() || "#25f58a";
    const glowColor = css.getPropertyValue("--monitor-glow").trim() || "rgba(37, 245, 138, 0.6)";
    g.fillStyle = monitorBg;
    g.fillRect(0, 0, w, h);

    // Minor gridlines (every 1 mm).
    g.strokeStyle = gridColor;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= w; x += mm) {
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, h);
    }
    for (let y = this.baselineY % mm; y <= h; y += mm) {
      g.moveTo(0, y + 0.5);
      g.lineTo(w, y + 0.5);
    }
    g.stroke();

    // Major gridlines (every 5 mm).
    g.strokeStyle = gridMajorColor;
    g.lineWidth = 1;
    g.beginPath();
    const big = mm * 5;
    for (let x = 0; x <= w; x += big) {
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, h);
    }
    for (let y = this.baselineY % big; y <= h; y += big) {
      g.moveTo(0, y + 0.5);
      g.lineTo(w, y + 0.5);
    }
    g.stroke();
  }

  /**
   * Append one signal sample (in mV) at the write cursor and advance it.
   * @param {number} mv  Signal value in millivolts.
   */
  push(mv) {
    this.samples[this.writeCol] = mv;
    this.writeCol = (this.writeCol + 1) % this.samples.length;
  }

  /** Map a millivolt value to a device-pixel Y coordinate. */
  _yOf(mv) {
    return this.baselineY - mv * MM_PER_MV * this.pxPerMm;
  }

  /** Draw the current frame: grid, trace, sweep bar. */
  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.drawImage(this.grid, 0, 0);

    const gap = Math.round(this.pxPerMm * 3); // ~3 mm blanking gap ahead of cursor
    ctx.lineWidth = Math.max(1.4, this.pxPerMm * 0.35);
    const css = getComputedStyle(document.documentElement);
    const waveformColor = css.getPropertyValue("--monitor-waveform").trim() || "#25f58a";
    const glowColor = css.getPropertyValue("--monitor-glow").trim() || "rgba(37, 245, 138, 0.6)";
    ctx.strokeStyle = waveformColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = this.pxPerMm * 0.8;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.beginPath();
    let pen = false;
    for (let x = 1; x < w; x++) {
      // Blank a short window just ahead of the write cursor (the sweep bar).
      const ahead = (x - this.writeCol + w) % w;
      if (ahead < gap) {
        pen = false;
        continue;
      }
      const y0 = this._yOf(this.samples[x - 1]);
      const y1 = this._yOf(this.samples[x]);
      if (!pen) {
        ctx.moveTo(x - 1, y0);
        pen = true;
      }
      ctx.lineTo(x, y1);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Lead label.
    ctx.fillStyle = waveformColor;
    ctx.font = `${Math.round(this.pxPerMm * 3.2)}px "IBM Plex Mono", monospace`;
    ctx.textBaseline = "top";
    ctx.fillText(this.lead.label, this.pxPerMm * 1.5, this.pxPerMm * 1.2);
  }
}
