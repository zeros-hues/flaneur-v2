"use client";

import { useEffect, useRef, useState } from "react";
import type { WalkAction } from "@/lib/walk/actions";
import type { WalkItem } from "@/lib/walk/select";
import { play, type Cue } from "@/lib/sound/engine";
import { WalkCard } from "./WalkCard";
import "./walk.css";

const STAGGER_MS = 120;
const SET_ASIDE_MS = 400;
const PAUSE_MS = 300;
const CLOSE_MS = 350;
const EMPTY_SURFACE_MS = 800;

const CUE: Record<WalkAction, Cue> = {
  say_hello: "sayHello",
  keep_walking: "cardSlide",
  just_passing: "cardSlide",
  street_closed: "streetClosed",
};

type Slot = "here" | "leaving" | "closing" | "gone";

/** "Wednesday, 1 October", in the reader's own time zone. */
function today(): string {
  const d = new Date();
  return `${d.toLocaleDateString("en-GB", { weekday: "long" })}, ${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "long" })}`;
}

export function Walk({ items }: { items: WalkItem[] }) {
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [date, setDate] = useState("");
  const [ended, setEnded] = useState(false);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const remaining = items.filter((i) => slots[i.artifactId] !== "gone");
  const empty = remaining.length === 0;

  // The date is the reader's, so it is written after hydration.
  useEffect(() => setDate(today()), []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // A finished walk: a moment of empty surface, then the ending settles in.
  useEffect(() => {
    if (!empty) return;
    const t = window.setTimeout(() => {
      setEnded(true);
      play("walkEnd");
    }, EMPTY_SURFACE_MS);
    return () => clearTimeout(t);
  }, [empty]);

  // Set aside at once; the gap closes after the pause, and only once the answer is saved.
  async function answered(id: string, action: WalkAction, saved: Promise<boolean>): Promise<boolean> {
    play(CUE[action]);
    setSlots((s) => ({ ...s, [id]: "leaving" }));
    const [ok] = await Promise.all([saved, new Promise((r) => later(() => r(null), SET_ASIDE_MS + PAUSE_MS))]);
    if (!ok) {
      setSlots((s) => ({ ...s, [id]: "here" }));
      return false;
    }
    setSlots((s) => ({ ...s, [id]: "closing" }));
    later(() => setSlots((s) => ({ ...s, [id]: "gone" })), CLOSE_MS);
    return true;
  }

  return (
    <>
      <div className="walk" data-empty={empty ? "" : undefined}>
        <p className="walk__date">{date}</p>
        <ol className="walk__cards">
          {remaining.map((item) => (
            <li key={item.artifactId} className="walk-slot" data-state={slots[item.artifactId] ?? "here"}>
              <div className="walk-slot__inner">
                <WalkCard
                  item={item}
                  delay={items.indexOf(item) * STAGGER_MS}
                  onAnswered={(action, saved) => answered(item.artifactId, action, saved)}
                />
              </div>
            </li>
          ))}
        </ol>
      </div>
      {ended && <p className="walk-ending">That’s today’s walk.</p>}
    </>
  );
}
