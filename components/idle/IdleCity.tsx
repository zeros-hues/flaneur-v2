"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { CityPair } from "@/lib/city/pairs";
import { useReducedMotion } from "@/lib/prefs";
import { createCityLoop } from "./cityLoop";

// Fetched once per session: the pairs are a property of the city, not of this visit to the page.
let cached: Promise<CityPair[]> | null = null;
function loadPairs(): Promise<CityPair[]> {
  // A failed load is not remembered: the next visit to the page asks again.
  cached ??= fetch("/api/city/pairs")
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<{ pairs: CityPair[] }>;
    })
    .then((body) => body.pairs)
    .catch(() => {
      cached = null;
      return [];
    });
  return cached;
}

type Props = {
  /** The input: the layer fills the empty space below it. */
  anchor: RefObject<HTMLElement | null>;
  /** Increments on each focus or keystroke in the input. */
  interrupt: number;
  /** True while the input is empty. */
  quiet: boolean;
};

/** The idle surface: two things from the city and the line between them. Decorative only. */
export function IdleCity({ anchor, interrupt, quiet }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pairs, setPairs] = useState<CityPair[] | null>(null);
  const reduced = useReducedMotion();
  const loop = useRef<ReturnType<typeof createCityLoop> | null>(null);
  const quietRef = useRef(quiet);
  useEffect(() => {
    quietRef.current = quiet;
  }, [quiet]);

  useEffect(() => {
    let live = true;
    void loadPairs().then((p) => live && setPairs(p));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !pairs?.length) return;
    let instance: ReturnType<typeof createCityLoop> | null = null;
    let cancelled = false;
    const measure = () => {
      const top = Math.round(anchor.current?.getBoundingClientRect().bottom ?? 0);
      const viewport = window.innerHeight;
      return { top, width: document.documentElement.clientWidth, height: Math.max(0, viewport - top), viewport };
    };
    const onResize = () => instance?.resize();
    const onSettle = (e: TransitionEvent) => {
      if (e.target instanceof Element && e.target.classList.contains("q__spacer")) instance?.resize();
    };
    // Names are measured in Lora italic, so wait for both sizes before placing anything.
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-lora").trim() || "serif";
    void Promise.all([document.fonts.load(`italic 15px ${family}`), document.fonts.ready]).then(() => {
      if (cancelled) return;
      instance = createCityLoop({ canvas: el, pairs, measure, isQuiet: () => quietRef.current, reducedMotion: reduced });
      loop.current = instance;
    });
    window.addEventListener("resize", onResize);
    // Returning to idle, the input settles back down after a transition; measure again once it lands.
    document.addEventListener("transitionend", onSettle);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      document.removeEventListener("transitionend", onSettle);
      instance?.destroy();
      loop.current = null;
    };
  }, [pairs, reduced, anchor]);

  // Only interruptions after mount count: the input's own autofocus is not one.
  const first = useRef(interrupt);
  useEffect(() => {
    if (interrupt !== first.current) loop.current?.interrupt();
  }, [interrupt]);

  // Empty city: nothing at all.
  if (!pairs?.length) return null;
  return <canvas ref={canvas} className="idle-city" aria-hidden="true" />;
}
