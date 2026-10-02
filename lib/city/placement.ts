// Where a pair may stand, and the curve between them. Rules from the spec sheet:
// names sit in a band from 30% down the empty space to 15% above the frame bottom; neither name box
// crosses the centre; names at least 40px apart vertically; chord at least 160px; the pair's centroid
// at least 360px from the previous pair's. The curve is a quadratic with its control point at 42%
// of the chord, bowing 12-18px toward the emptier side, ending 22px short of each name box.
import type { Point } from "@/lib/ink/stroke";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Frame {
  /** Layer size: the empty space below the input. */
  width: number;
  height: number;
  /** Viewport height: the band stops 15% of it above the bottom. */
  viewport: number;
  /** Horizontal page gutter names stay inside. */
  gutter: number;
}

export interface Placed {
  a: Box;
  b: Box;
  curve: Point[];
  centroid: Point;
}

const MIN_VERTICAL = 40;
const MIN_CHORD = 160;
const MIN_TRAVEL = 360;
const END_GAP = 22;
const CONTROL_AT = 0.42;
const ATTEMPTS = 300;

const centre = (b: Box): Point => [b.x + b.w / 2, b.y + b.h / 2];

// Distance from a box's centre to its edge along the unit direction (dx, dy).
function exitDistance(b: Box, dx: number, dy: number): number {
  const tx = dx ? b.w / 2 / Math.abs(dx) : Infinity;
  const ty = dy ? b.h / 2 / Math.abs(dy) : Infinity;
  return Math.min(tx, ty);
}

function sampleBox(w: number, h: number, f: Frame, rand: () => number): Box | null {
  const top = f.height * 0.3;
  const bottom = f.height - f.viewport * 0.15;
  const mid = f.width / 2;
  const leftSide = rand() < 0.5;
  const minX = leftSide ? f.gutter : mid;
  const maxX = (leftSide ? mid : f.width - f.gutter) - w;
  if (maxX < minX || bottom - h < top) return null;
  return { x: minX + rand() * (maxX - minX), y: top + rand() * (bottom - h - top), w, h };
}

function curveBetween(a: Box, b: Box, f: Frame): Point[] | null {
  const [ax, ay] = centre(a);
  const [bx, by] = centre(b);
  const chord = Math.hypot(bx - ax, by - ay);
  const dx = (bx - ax) / chord;
  const dy = (by - ay) / chord;
  const start: Point = [ax + dx * (exitDistance(a, dx, dy) + END_GAP), ay + dy * (exitDistance(a, dx, dy) + END_GAP)];
  const end: Point = [bx - dx * (exitDistance(b, dx, dy) + END_GAP), by - dy * (exitDistance(b, dx, dy) + END_GAP)];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  if (length < 60 || (end[0] - start[0]) * dx + (end[1] - start[1]) * dy <= 0) return null;

  // Bow toward whichever side of the chord has more open space in the layer.
  const bow = 12 + 6 * Math.min(1, Math.max(0, (length - MIN_CHORD) / 400));
  const mid: Point = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const clearance = (nx: number, ny: number) => {
    const px = mid[0] + nx * 60;
    const py = mid[1] + ny * 60;
    return Math.min(px, f.width - px, py, f.height - py);
  };
  const side = clearance(-dy, dx) >= clearance(dy, -dx) ? 1 : -1;
  const nx = -dy * side;
  const ny = dx * side;
  // A quadratic's furthest point from its chord is half its control point's offset.
  const control: Point = [
    start[0] + (end[0] - start[0]) * CONTROL_AT + nx * bow * 2,
    start[1] + (end[1] - start[1]) * CONTROL_AT + ny * bow * 2,
  ];
  const points: Point[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const u = 1 - t;
    points.push([
      u * u * start[0] + 2 * u * t * control[0] + t * t * end[0],
      u * u * start[1] + 2 * u * t * control[1] + t * t * end[1],
    ]);
  }
  return points;
}

/**
 * Samples positions for two name boxes (sizes given) until every rule passes. If the previous
 * pair's distance cannot be kept (a narrow screen), that one rule is dropped. Null when nothing fits.
 */
export function place(
  sizeA: { w: number; h: number },
  sizeB: { w: number; h: number },
  f: Frame,
  previous: Point | null,
  rand: () => number = Math.random,
): Placed | null {
  for (const keepDistance of previous ? [true, false] : [false]) {
    for (let i = 0; i < ATTEMPTS; i++) {
      const a = sampleBox(sizeA.w, sizeA.h, f, rand);
      const b = sampleBox(sizeB.w, sizeB.h, f, rand);
      if (!a || !b) return null;
      const [ax, ay] = centre(a);
      const [bx, by] = centre(b);
      if (Math.abs(ay - by) < MIN_VERTICAL || Math.hypot(bx - ax, by - ay) < MIN_CHORD) continue;
      const centroid: Point = [(ax + bx) / 2, (ay + by) / 2];
      if (keepDistance && previous && Math.hypot(centroid[0] - previous[0], centroid[1] - previous[1]) < MIN_TRAVEL) continue;
      const curve = curveBetween(a, b, f);
      if (curve) return { a, b, curve, centroid };
    }
  }
  return null;
}
