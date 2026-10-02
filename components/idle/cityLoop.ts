// The idle "noticing" loop: an imperative canvas engine, so no React work happens per frame.
// Paints only while something moves (arrival, drawing, departure); rest and gap are timers.
import type { CityPair, PairItem } from "@/lib/city/pairs";
import { place, type Placed } from "@/lib/city/placement";
import { CYCLE_MS, DISSOLVE_MS, dissolve, frameAt, GAP_START_MS, nextMotionAt, REST, type Frame } from "@/lib/city/timeline";
import { inkOutline, outlinePolygon, WEIGHTS, type InkOutline, type Point } from "@/lib/ink/stroke";

const SIZE = { person: 15, idea: 13 } as const;
const TRACKING = 0.08; // em
/** After an interruption, the loop returns this long after the last keystroke if the field is empty. */
const RESUME_AFTER_MS = 20_000;

interface Shown {
  pair: CityPair;
  placed: Placed;
  outline: InkOutline;
  /** Everything this pair can paint, padded, in layer coordinates. The canvas is fitted to it. */
  bounds: Rect;
  /** Both names at full opacity, drawn once; each frame stamps this at the frame's opacity. */
  names: HTMLCanvasElement;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LoopOptions {
  canvas: HTMLCanvasElement;
  pairs: CityPair[];
  /** Layer geometry, measured by the component. */
  measure: () => { top: number; width: number; height: number; viewport: number };
  isQuiet: () => boolean;
  reducedMotion: boolean;
}

export function createCityLoop({ canvas, pairs, measure, isQuiet, reducedMotion }: LoopOptions) {
  const ctx = canvas.getContext("2d");
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-lora").trim() || "serif";
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#2B2420";
  const font = (item: PairItem) => `italic 400 ${SIZE[item.kind]}px ${family}`;

  let size = { width: 0, height: 0, viewport: 0 };
  let layerTop = 0;
  let dpr = 1;
  let order: number[] = [];
  let lastShown = -1;
  let previous: Point | null = null;
  let shown: Shown | null = null;
  let cycleStart = 0;
  let mode: "loop" | "dissolving" | "stopped" = "loop";
  let dissolveStart = 0;
  let hiddenAt: number | null = null;
  let raf = 0;
  let timer = 0;
  let resumeTimer = 0;

  function shuffle(): number[] {
    const next = pairs.map((_, i) => i);
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j] as number, next[i] as number];
    }
    // Never the same pair twice in a row across a reshuffle.
    if (next.length > 1 && next[0] === lastShown) next.push(next.shift() as number);
    return next;
  }

  function measureItem(item: PairItem) {
    if (!ctx) return { w: 0, h: 0, ascent: 0 };
    ctx.font = font(item);
    ctx.letterSpacing = `${SIZE[item.kind] * TRACKING}px`;
    const m = ctx.measureText(item.label);
    const ascent = m.fontBoundingBoxAscent || SIZE[item.kind] * 0.9;
    const descent = m.fontBoundingBoxDescent || SIZE[item.kind] * 0.25;
    return { w: m.width, h: ascent + descent, ascent };
  }

  function layout(pair: CityPair): Shown | null {
    const a = measureItem(pair.a);
    const b = measureItem(pair.b);
    const gutter = size.width < 800 ? 24 : 64;
    const placed = place(a, b, { ...size, gutter }, previous);
    if (!placed) return null;
    // Seeded per pair, so a pair always draws the same way.
    const outline = inkOutline(placed.curve, { weight: WEIGHTS.correspondence, seed: `${pair.a.id}:${pair.b.id}`, wobble: 0.5 });
    const xs = [placed.a.x, placed.a.x + placed.a.w, placed.b.x, placed.b.x + placed.b.w];
    const ys = [placed.a.y, placed.a.y + placed.a.h, placed.b.y, placed.b.y + placed.b.h];
    for (const [x, y] of [...outline.left, ...outline.right]) {
      xs.push(x);
      ys.push(y);
    }
    const pad = 4;
    const x = Math.floor(Math.min(...xs) - pad);
    const y = Math.floor(Math.min(...ys) - pad);
    const bounds = { x, y, w: Math.ceil(Math.max(...xs) + pad) - x, h: Math.ceil(Math.max(...ys) + pad) - y };

    const names = document.createElement("canvas");
    names.width = Math.ceil(bounds.w * dpr);
    names.height = Math.ceil(bounds.h * dpr);
    const n = names.getContext("2d");
    if (n) {
      n.setTransform(dpr, 0, 0, dpr, -bounds.x * dpr, -bounds.y * dpr);
      n.fillStyle = ink;
      for (const [item, box, rise] of [[pair.a, placed.a, a.ascent], [pair.b, placed.b, b.ascent]] as const) {
        n.font = font(item);
        n.letterSpacing = `${SIZE[item.kind] * TRACKING}px`;
        n.fillText(item.label, box.x, box.y + rise);
      }
    }
    return { pair, placed, outline, bounds, names };
  }

  /** Fits the canvas to what is showing, so each frame rasters and composites only that. */
  function fit() {
    if (!ctx) return;
    const b = shown?.bounds ?? { x: 0, y: 0, w: 0, h: 0 };
    canvas.style.left = `${b.x}px`;
    canvas.style.top = `${layerTop + b.y}px`;
    canvas.style.width = `${b.w}px`;
    canvas.style.height = `${b.h}px`;
    canvas.width = Math.ceil(b.w * dpr);
    canvas.height = Math.ceil(b.h * dpr);
    // Drawing stays in layer coordinates.
    ctx.setTransform(dpr, 0, 0, dpr, -b.x * dpr, -b.y * dpr);
  }

  function show(next: Shown | null) {
    shown = next;
    fit();
  }

  /** The next pair that fits the frame; null (bare paper for a cycle) when none does. */
  function advance(): Shown | null {
    for (let tries = 0; tries < pairs.length; tries++) {
      if (!order.length) order = shuffle();
      const index = order.shift() as number;
      const next = layout(pairs[index] as CityPair);
      if (next) {
        lastShown = index;
        previous = next.placed.centroid;
        return next;
      }
    }
    return null;
  }

  function paint(f: Frame) {
    if (!ctx) return;
    if (!shown) return;
    const { bounds, names, outline } = shown;
    ctx.clearRect(bounds.x, bounds.y, bounds.w, bounds.h);
    if (f.names <= 0 && f.stroke <= 0) return;
    ctx.globalAlpha = f.names;
    ctx.drawImage(names, bounds.x, bounds.y, bounds.w, bounds.h);
    if (f.stroke > 0 && f.reveal > 0) {
      ctx.fillStyle = ink;
      ctx.globalAlpha = f.stroke;
      const poly = outlinePolygon(outline, f.reveal);
      ctx.beginPath();
      poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function cancel() {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    raf = 0;
    timer = 0;
  }

  function tick(now: number) {
    raf = 0;
    let t = now - cycleStart;
    if (t >= CYCLE_MS) {
      if (mode === "dissolving") return stop();
      show(advance());
      cycleStart = now;
      t = 0;
    }
    const f = frameAt(t);
    if (mode === "dissolving") {
      const p = (now - dissolveStart) / DISSOLVE_MS;
      if (p >= 1) return stop();
      const k = 1 - dissolve(p);
      paint({ names: f.names * k, stroke: f.stroke * k, reveal: f.reveal });
      raf = requestAnimationFrame(tick);
      return;
    }
    paint(f);
    const next = nextMotionAt(t);
    if (next <= t) raf = requestAnimationFrame(tick);
    else timer = window.setTimeout(() => (raf = requestAnimationFrame(tick)), next - t);
  }

  function stop() {
    cancel();
    mode = "stopped";
    show(null);
  }

  function resize() {
    const m = measure();
    dpr = window.devicePixelRatio || 1;
    size = { width: m.width, height: m.height, viewport: m.viewport };
    layerTop = m.top;
    // Re-place what is showing for the new frame; its timeline carries on.
    previous = null;
    show(shown ? layout(shown.pair) : null);
    previous = shown?.placed.centroid ?? null;
    // Repaint now unless a frame is already on its way (stopped and empty layers paint as clear).
    if (reducedMotion) paint(REST);
    else if (!raf) paint(frameAt(performance.now() - cycleStart));
  }

  function start(at: number) {
    cancel();
    mode = "loop";
    if (reducedMotion) {
      // One pair and its full stroke, static at rest opacity; a new pair each visit.
      show(advance());
      paint(REST);
      return;
    }
    cycleStart = performance.now() - at;
    show(at >= GAP_START_MS ? null : advance());
    raf = requestAnimationFrame(tick);
  }

  function onVisibility() {
    if (reducedMotion || mode === "stopped") return;
    if (document.hidden) {
      hiddenAt = performance.now();
      cancel();
    } else if (hiddenAt !== null) {
      cycleStart += performance.now() - hiddenAt;
      if (mode === "dissolving") dissolveStart += performance.now() - hiddenAt;
      hiddenAt = null;
      raf = requestAnimationFrame(tick);
    }
  }

  resize();
  start(0);
  document.addEventListener("visibilitychange", onVisibility);

  return {
    resize,
    /** Focus or a keystroke: the loop quietly dissolves, and returns once the field has been left empty. */
    interrupt() {
      clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(function check() {
        if (isQuiet()) start(GAP_START_MS);
        else resumeTimer = window.setTimeout(check, RESUME_AFTER_MS);
      }, RESUME_AFTER_MS);
      if (mode !== "loop") return;
      if (reducedMotion) return stop();
      cancel();
      mode = "dissolving";
      dissolveStart = performance.now();
      raf = requestAnimationFrame(tick);
    },
    destroy() {
      cancel();
      clearTimeout(resumeTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
