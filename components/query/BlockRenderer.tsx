"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { InkLine } from "@/components/ink/InkLine";
import type { Block, MarginItem } from "@/lib/query/blocks";
import type { EmptyReason } from "@/lib/search/types";
import { AnswerBlock } from "./AnswerBlock";
import { PeopleBlock, type SaveTarget } from "./PeopleBlock";
import { ms, schedule } from "./timing";

export const EMPTY_TEXT: Record<EmptyReason | "error", string> = {
  insufficient_data: "Your city is still quiet on this.",
  no_match: "Nobody in your city matches this yet.",
  parse_error: "Try asking that a different way.",
  error: "Something went wrong. Try again.",
};

export function EmptyText({ reason, at = 0 }: { reason: EmptyReason | "error"; at?: number }) {
  return (
    <p className="q-empty" style={ms(at)}>
      {EMPTY_TEXT[reason]}
    </p>
  );
}

// Desktop only: a loose, hand-placed column rather than a ruled list.
const INDENTS = [0, 18, 6, 26, 10, 2];

function Margin({ items, at }: { items: MarginItem[]; at: number }) {
  if (!items.length) return null;
  return (
    <aside className="q__margin" aria-label="Related" style={ms(at)}>
      {items.map((m, i) => (
        <Link
          key={m.concept_id}
          href={`/concept/${m.concept_id}`}
          style={{ "--indent": `${INDENTS[i % INDENTS.length]}px` } as CSSProperties}
        >
          {m.label}
        </Link>
      ))}
    </aside>
  );
}

/** Maps each block to its component and owns the entrance choreography, by block order. */
export function BlockRenderer({ blocks, save }: { blocks: Block[]; save: SaveTarget | null }) {
  const starts = schedule(blocks);
  const main = blocks.flatMap((block, i) => {
    const at = starts[i] ?? 0;
    switch (block.type) {
      case "answer":
        return [<AnswerBlock key={i} text={block.text} sources={block.sources} drawnFrom={block.drawn_from} at={at} />];
      case "rule":
        return [
          <InkLine key={i} className="q-rule" weight="rule" seed="query-rule" duration={600} delay={at} ease="cubic-bezier(.45,0,.3,1)" />,
        ];
      case "people":
        return [<PeopleBlock key={i} items={block.items} coverage={block.coverage} save={save} at={at} />];
      case "empty":
        return [<EmptyText key={i} reason={block.reason} at={at} />];
      case "margin":
        return [];
    }
  });
  const marginIndex = blocks.findIndex((b) => b.type === "margin");
  const margin = blocks[marginIndex];

  return (
    <>
      <div className="q__main">{main}</div>
      {margin?.type === "margin" && <Margin items={margin.items} at={starts[marginIndex] ?? 0} />}
    </>
  );
}
