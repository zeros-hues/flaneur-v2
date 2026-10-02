// The overlay's outline: four hand-drawn sides from the app's ink primitive (lib/ink/stroke.ts).
// Each side is a long faint stroke plus a shorter full one, so the corners stay open, as in the reference.
import { inkStroke, type Point, type Weight } from "../../../lib/ink/stroke";

const SVG_NS = "http://www.w3.org/2000/svg";
const LONG: Weight = { start: 0.5, full: 0.9, end: 0.5 };
const SHORT: Weight = { start: 0.6, full: 1, end: 0.6 };

type Side = { long: Point[]; short: Point[] };

// Fractions along each side, with a little drift off the edge (in px), from the reference frame.
function sides(w: number, h: number): Side[] {
  const x = (f: number) => w * f;
  const y = (f: number) => h * f;
  return [
    { long: [[x(0.025), 1.1], [x(0.3), 0.7], [x(0.68), 1.4], [x(0.975), 0.9]], short: [[x(0.09), 0.95], [x(0.35), 0.75], [x(0.66), 1.25], [x(0.91), 1]] },
    { long: [[w - 0.9, y(0.03)], [w - 0.6, y(0.34)], [w - 1.2, y(0.68)], [w - 0.8, y(0.972)]], short: [[w - 0.8, y(0.12)], [w - 0.65, y(0.38)], [w - 1.1, y(0.66)], [w - 0.9, y(0.88)]] },
    { long: [[x(0.97), h - 0.9], [x(0.66), h - 0.6], [x(0.34), h - 1.2], [x(0.028), h - 0.8]], short: [[x(0.9), h - 0.85], [x(0.64), h - 0.65], [x(0.36), h - 1.1], [x(0.1), h - 0.9]] },
    { long: [[0.9, y(0.965)], [0.6, y(0.62)], [1.2, y(0.3)], [0.8, y(0.032)]], short: [[0.85, y(0.88)], [0.7, y(0.6)], [1.1, y(0.34)], [0.85, y(0.12)]] },
  ];
}

/** An SVG that fills its positioned parent and traces its edges; redraws when the parent resizes. */
export function inkOutline(parent: HTMLElement): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "outline");

  const draw = () => {
    const w = parent.offsetWidth;
    const h = parent.offsetHeight;
    if (!w || !h) return;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.replaceChildren(
      ...sides(w, h).flatMap((side, i) =>
        (["long", "short"] as const).map((kind) => {
          const path = document.createElementNS(SVG_NS, "path");
          path.setAttribute("d", inkStroke(side[kind], { weight: kind === "long" ? LONG : SHORT, seed: `overlay:${i}:${kind}` }).d);
          path.setAttribute("class", kind);
          return path;
        }),
      ),
    );
  };

  new ResizeObserver(draw).observe(parent);
  return svg;
}
