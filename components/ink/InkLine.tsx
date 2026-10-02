"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { horizontalPoints, inkStroke, WEIGHTS, type Point, type Weight, type WeightName } from "@/lib/ink/stroke";

const TONES = {
  ink: "var(--ink)",
  quiet: "var(--ink-quiet)",
  faint: "var(--ink-faint)",
  accent: "var(--accent)",
} as const;

type Props = {
  weight: WeightName | Weight;
  seed: number | string;
  /** Control points in px. Omit for a straight line that fills its container. */
  points?: readonly Point[];
  /** Without points: run top to bottom, filling the container's height, and draw downward. */
  vertical?: boolean;
  tone?: keyof typeof TONES;
  /** Reveal left to right on mount. Reduced motion shows the finished line. */
  draw?: boolean;
  duration?: number;
  delay?: number;
  /**
   * Count the delay from page load instead of from when the line appears (after hydration), so it
   * keeps its place among CSS entrances that start at first paint. A late line draws at once.
   */
  delayFromLoad?: boolean;
  ease?: string;
  wobble?: number;
  className?: string;
};

export function InkLine({
  weight,
  seed,
  points,
  vertical = false,
  tone = "faint",
  draw = true,
  duration = 600,
  delay = 0,
  delayFromLoad = false,
  ease,
  wobble,
  className,
}: Props) {
  const w = typeof weight === "string" ? WEIGHTS[weight] : weight;
  // Room for the full width plus edge noise, so nothing is clipped.
  const thickness = Math.ceil(w.full + 2);
  const ref = useRef<HTMLDivElement>(null);
  const [length, setLength] = useState<number | null>(null);
  // Fixed once, when the line first appears; resizes must not move it.
  const [appearedAt] = useState(() => (typeof document === "undefined" ? 0 : Number(document.timeline.currentTime ?? 0)));
  const effectiveDelay = delayFromLoad ? Math.max(0, delay - appearedAt) : delay;

  // Straight lines are generated at their real pixel length, so weight and noise stay true.
  useLayoutEffect(() => {
    if (points) return;
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setLength(Math.round(vertical ? r.height : r.width));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [points, vertical]);

  const stroke = useMemo(() => {
    if (points) return inkStroke(points, { weight: w, seed, wobble });
    if (!length) return null;
    const along = horizontalPoints(length, thickness / 2, seed);
    return inkStroke(vertical ? along.map(([x, y]) => [y, x] as const) : along, { weight: w, seed, wobble });
  }, [points, length, thickness, vertical, w, seed, wobble]);

  const style = {
    "--ink-duration": `${duration}ms`,
    "--ink-delay": `${effectiveDelay}ms`,
    ...(ease ? { "--ink-ease": ease } : {}),
  } as CSSProperties;
  const svgClass = draw ? (vertical ? "ink ink--draw-down" : "ink ink--draw") : "ink";

  if (points) {
    if (!stroke) return null;
    const { maxX, maxY } = stroke.bounds;
    return (
      <svg
        aria-hidden="true"
        className={[svgClass, className].filter(Boolean).join(" ")}
        style={style}
        width={Math.ceil(maxX)}
        height={Math.ceil(maxY)}
        viewBox={`0 0 ${Math.ceil(maxX)} ${Math.ceil(maxY)}`}
      >
        <path d={stroke.d} fill={TONES[tone]} />
      </svg>
    );
  }

  const [svgW, svgH] = vertical ? [thickness, length ?? 0] : [length ?? 0, thickness];
  return (
    <div ref={ref} aria-hidden="true" className={className} style={vertical ? { width: thickness } : { height: thickness }}>
      {stroke && length ? (
        <svg className={svgClass} style={style} width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
          <path d={stroke.d} fill={TONES[tone]} />
        </svg>
      ) : null}
    </div>
  );
}
