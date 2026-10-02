// A small deterministic layout for the city view: people who share concepts settle near each other.
// Force-directed (repulsion between everyone, springs between people who share concepts, a little
// gravity), a fixed number of steps from a fixed start, so the same city always lands the same way.
// Then a pass that pushes overlapping labels apart. Runs once per request; O(n² · steps).

export const FIELD_WIDTH = 1000;
const STEPS = 300;
const PAD = 40;
// Each person's footprint on the page: the ring (64px) and the label to its right (190px wide).
const BOX = { left: 32, right: 178, top: 32, bottom: 34 };

export interface Placed {
  x: number;
  y: number;
}

/** Field height for n people: 720px, growing with the city so density stays readable. */
export const fieldHeight = (n: number) => Math.round(720 * Math.max(1, Math.sqrt(n / 20)));

/**
 * `weight(i, j)` is how strongly two people belong together (shared concepts); 0 means unrelated.
 * Returns positions in a FIELD_WIDTH × fieldHeight(n) field, in the order given.
 */
export function layout(n: number, weight: (i: number, j: number) => number): Placed[] {
  const W = FIELD_WIDTH;
  const H = fieldHeight(n);
  if (n === 0) return [];

  // A sunflower spiral: an even, deterministic start.
  const pos = Array.from({ length: n }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / n) * Math.min(W, H) * 0.42;
    const a = i * 2.399963;
    return { x: W / 2 + r * Math.cos(a), y: H / 2 + r * Math.sin(a) };
  });
  const k = Math.sqrt((W * H) / n) * 0.55;

  for (let step = 0; step < STEPS; step++) {
    const temperature = 60 * (1 - step / STEPS) + 1;
    const move = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) {
      const p = pos[i] as Placed;
      for (let j = i + 1; j < n; j++) {
        const q = pos[j] as Placed;
        let dx = p.x - q.x;
        let dy = p.y - q.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) {
          // Coincident: separate along a fixed direction, so the result stays deterministic.
          [dx, dy, d] = [1, 0, 1];
        }
        const w = weight(i, j);
        const force = (k * k) / d - (w > 0 ? (w * d * d) / k : 0);
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;
        (move[i] as Placed).x += fx;
        (move[i] as Placed).y += fy;
        (move[j] as Placed).x -= fx;
        (move[j] as Placed).y -= fy;
      }
      // Gravity keeps the unconnected from drifting to the walls (tuned: none on a wall at 17 people, 4 of 60).
      (move[i] as Placed).x += (W / 2 - p.x) * 2 * (k / 100);
      (move[i] as Placed).y += (H / 2 - p.y) * 2 * (k / 100);
    }
    pos.forEach((p, i) => {
      const m = move[i] as Placed;
      const len = Math.hypot(m.x, m.y) || 1;
      const step = Math.min(len, temperature);
      p.x = Math.min(W - PAD, Math.max(PAD, p.x + (m.x / len) * step));
      p.y = Math.min(H - PAD, Math.max(PAD, p.y + (m.y / len) * step));
    });
  }

  // Labels must not sit on each other: push overlapping footprints apart along the shorter axis.
  const w = BOX.left + BOX.right;
  const h = BOX.top + BOX.bottom;
  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const p = pos[i] as Placed;
        const q = pos[j] as Placed;
        const ox = w - Math.abs(p.x - q.x);
        const oy = h - Math.abs(p.y - q.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) {
          const s = (p.x <= q.x ? -1 : 1) * (ox / 2 + 1);
          p.x += s;
          q.x -= s;
        } else {
          const s = (p.y <= q.y ? -1 : 1) * (oy / 2 + 1);
          p.y += s;
          q.y -= s;
        }
      }
    }
    for (const p of pos) {
      p.x = Math.min(W - PAD, Math.max(PAD, p.x));
      p.y = Math.min(H - PAD, Math.max(PAD, p.y));
    }
    if (!moved) break;
  }
  return pos.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}
