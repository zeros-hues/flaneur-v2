// One pair's life on the idle surface, from the spec sheet ("Opacity over one pair · 10.2s").
// All opacities are element opacity on --ink over the grained surface.
import { cubicBezier } from "@/lib/motion/easing";

export const CYCLE_MS = 10_200;
export const GAP_START_MS = 9_000;
export const DISSOLVE_MS = 600;

const ARRIVAL_END = 1_200;
const DRAW_END = 4_800;
const DEPART = 7_000;
const NAMES_DEPART_MS = 2_000;
const STROKE_DEPART_MS = 1_600;

export const NAME_OPACITY = 0.18;
export const STROKE_OPACITY = 0.4;

const arrive = cubicBezier(0.25, 0.46, 0.45, 0.94); // ease-out
const depart = cubicBezier(0.55, 0.055, 0.675, 0.19); // ease-in
// Handwriting pace: slower as the pen lands and lifts, quicker through the middle.
const pen = cubicBezier(0.3, 0.1, 0.7, 0.9);
export const dissolve = cubicBezier(0.4, 0, 0.2, 1);

export interface Frame {
  names: number;
  stroke: number;
  /** Fraction of the stroke drawn, 0..1. */
  reveal: number;
}

export function frameAt(t: number): Frame {
  const names =
    t < ARRIVAL_END
      ? NAME_OPACITY * arrive(t / ARRIVAL_END)
      : t < DEPART
        ? NAME_OPACITY
        : NAME_OPACITY * (1 - depart((t - DEPART) / NAMES_DEPART_MS));
  // The stroke appears at full opacity the instant it starts drawing; the line leaves first.
  const stroke =
    t < ARRIVAL_END ? 0 : t < DEPART ? STROKE_OPACITY : STROKE_OPACITY * (1 - depart((t - DEPART) / STROKE_DEPART_MS));
  const reveal = t < ARRIVAL_END ? 0 : t < DRAW_END ? pen((t - ARRIVAL_END) / (DRAW_END - ARRIVAL_END)) : 1;
  return { names: Math.max(0, names), stroke: Math.max(0, stroke), reveal };
}

/** The resting frame: both names and the full stroke. Reduced motion shows only this. */
export const REST: Frame = { names: NAME_OPACITY, stroke: STROKE_OPACITY, reveal: 1 };

/** When the next frame must be painted, or the time at which motion resumes after a still phase. */
export function nextMotionAt(t: number): number {
  if (t < DRAW_END) return t; // arrival and drawing: every frame
  if (t < DEPART) return DEPART; // rest: nothing moves
  if (t < DEPART + NAMES_DEPART_MS) return t; // departure: every frame
  return CYCLE_MS; // gap: bare paper
}
