// Ink stroke: control points + seed -> a variable-width filled SVG outline.
// The pen lands thin, reaches full pressure by 35%, holds to 65%, then lifts.
// The left edge is clean; the right edge carries a seeded low-amplitude noise,
// so the same seed always draws the same stroke. All units are CSS pixels.

export type Point = readonly [number, number];

export type Weight = { start: number; full: number; end: number };

// Width profiles (px) from DESIGN.md and the animation spec sheet.
export const WEIGHTS = {
  input: { start: 0.8, full: 1.2, end: 0.9 },
  rule: { start: 0.7, full: 1, end: 0.6 },
  walkMark: { start: 2.5, full: 3, end: 2 },
  correspondence: { start: 0.6, full: 1.2, end: 0.7 },
} as const satisfies Record<string, Weight>;

export type WeightName = keyof typeof WEIGHTS;

export type StrokeOptions = {
  weight: Weight;
  seed: number | string;
  /** Right-edge noise amplitude in px (spec: within ±0.2px). */
  noise?: number;
  /** Low-frequency centreline wobble in px, pinned at both ends. */
  wobble?: number;
  /** Fraction of the stroke drawn so far, 0..1: reveal by truncating, so the tip carries its true weight. */
  upTo?: number;
};

export type Stroke = {
  d: string;
  length: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

const PRESSURE_FULL = 0.35;
const PRESSURE_LIFT = 0.65;
const NOISE_WAVELENGTHS = [7.3, 2.9, 1.3]; // px
const NOISE_AMPLITUDES = [0.5, 0.3, 0.2]; // sums to 1, so noise stays within ±amplitude

function hashSeed(seed: number | string): number {
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32: small, fast, deterministic.
function random(seed: number | string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function widthAt(u: number, w: Weight): number {
  if (u < PRESSURE_FULL) return lerp(w.start, w.full, smooth(u / PRESSURE_FULL));
  if (u > PRESSURE_LIFT) return lerp(w.full, w.end, smooth((u - PRESSURE_LIFT) / (1 - PRESSURE_LIFT)));
  return w.full;
}

// Uniform Catmull-Rom through the control points, densely sampled.
function centreline(points: readonly Point[]): Point[] {
  if (points.length < 2) throw new Error("inkStroke needs at least two points");
  const at = (i: number): Point => points[Math.max(0, Math.min(points.length - 1, i))] as Point;
  const out: Point[] = [];
  const steps = 32;
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (k: 0 | 1) =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([c(0), c(1)]);
    }
  }
  out.push(at(points.length - 1));
  return out;
}

// Resample at equal arc length: position, unit tangent and distance travelled.
function resample(line: Point[], count: number) {
  const cum = [0];
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1] as Point;
    const [bx, by] = line[i] as Point;
    cum.push((cum[i - 1] as number) + Math.hypot(bx - ax, by - ay));
  }
  const length = cum[cum.length - 1] as number;
  const samples: { x: number; y: number; tx: number; ty: number; s: number }[] = [];
  let j = 1;
  for (let k = 0; k < count; k++) {
    const s = (length * k) / (count - 1);
    while (j < line.length - 1 && (cum[j] as number) < s) j++;
    const [ax, ay] = line[j - 1] as Point;
    const [bx, by] = line[j] as Point;
    const seg = (cum[j] as number) - (cum[j - 1] as number) || 1;
    const t = Math.min(1, Math.max(0, (s - (cum[j - 1] as number)) / seg));
    const dx = bx - ax;
    const dy = by - ay;
    const n = Math.hypot(dx, dy) || 1;
    samples.push({ x: lerp(ax, bx, t), y: lerp(ay, by, t), tx: dx / n, ty: dy / n, s });
  }
  return { samples, length };
}

const r = (v: number) => Math.round(v * 100) / 100;

/** A stroke built once: both edges at every sample, ready to be revealed by truncation. */
export interface InkOutline {
  left: Point[];
  right: Point[];
  /** Centreline position and unit tangent at each sample, for the tapered tips. */
  centre: { x: number; y: number; tx: number; ty: number }[];
  weight: Weight;
  length: number;
}

export function inkOutline(points: readonly Point[], opts: Omit<StrokeOptions, "upTo">): InkOutline {
  const rand = random(opts.seed);
  const noise = opts.noise ?? 0.2;
  const wobble = opts.wobble ?? 0;
  const phases = NOISE_WAVELENGTHS.map(() => rand() * Math.PI * 2);
  const wobbleFreq = 0.6 + rand() * 0.6;
  const wobblePhase = rand() * Math.PI * 2;

  const line = centreline(points);
  const rough = resample(line, 2).length;
  // 140 samples (spec) for short strokes; denser on long rules so the noise stays fine-grained.
  const count = Math.max(140, Math.min(480, Math.ceil(rough / 2)));
  const { samples, length } = resample(line, count);

  const left: Point[] = [];
  const right: Point[] = [];
  const centre: InkOutline["centre"] = [];
  samples.forEach((p, k) => {
    const u = k / (count - 1);
    // Normal to the left of travel (screen coordinates, y down).
    const nx = p.ty;
    const ny = -p.tx;
    const shift = wobble * Math.sin(Math.PI * u) * Math.sin(2 * Math.PI * wobbleFreq * u + wobblePhase);
    const cx = p.x + nx * shift;
    const cy = p.y + ny * shift;
    const half = widthAt(u, opts.weight) / 2;
    let n = 0;
    NOISE_WAVELENGTHS.forEach((lambda, i) => {
      n += (NOISE_AMPLITUDES[i] as number) * Math.sin((2 * Math.PI * p.s) / lambda + (phases[i] as number));
    });
    const outer = Math.max(0.05, half + noise * n);
    left.push([cx + nx * half, cy + ny * half]);
    right.push([cx - nx * outer, cy - ny * outer]);
    centre.push({ x: cx, y: cy, tx: p.tx, ty: p.ty });
  });
  return { left, right, centre, weight: opts.weight, length };
}

/**
 * The closed outline drawn up to `upTo` (0..1) of the stroke. Truncating the samples, rather than
 * masking, means the pen tip always carries the weight it has at that point.
 */
export function outlinePolygon(o: InkOutline, upTo = 1): Point[] {
  const count = o.left.length;
  const last = Math.max(1, Math.round((count - 1) * Math.min(1, Math.max(0, upTo))));
  // Tapered ends: a short tip beyond each end of the centreline.
  const first = o.centre[0] as InkOutline["centre"][number];
  const end = o.centre[last] as InkOutline["centre"][number];
  const startReach = o.weight.start * 0.6;
  const endReach = widthAt(last / (count - 1), o.weight) * 0.6;
  const startTip: Point = [first.x - first.tx * startReach, first.y - first.ty * startReach];
  const endTip: Point = [end.x + end.tx * endReach, end.y + end.ty * endReach];
  return [startTip, ...o.left.slice(0, last + 1), endTip, ...o.right.slice(0, last + 1).reverse()];
}

export function inkStroke(points: readonly Point[], opts: StrokeOptions): Stroke {
  const o = inkOutline(points, opts);
  const outline = outlinePolygon(o, opts.upTo ?? 1);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of outline) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const d = "M" + outline.map(([x, y]) => `${r(x)} ${r(y)}`).join("L") + "Z";
  return { d, length: o.length, bounds: { minX, minY, maxX, maxY } };
}

// Control points for a horizontal rule of the given width, with a faint seeded drift
// so the line sits like ink on paper rather than a ruled edge.
export function horizontalPoints(width: number, y: number, seed: number | string): Point[] {
  const rand = random(`${seed}:h`);
  const drift = () => (rand() - 0.5) * 0.6;
  return [
    [0, y],
    [width * 0.33, y + drift()],
    [width * 0.66, y + drift()],
    [width, y],
  ];
}
