import type { CSSProperties } from "react";
import type { Block, BlockType } from "@/lib/query/blocks";

/** How long each block's entrance runs before the next block may begin, in ms (from the reference). */
const SPAN: Record<BlockType, number> = { answer: 1500, rule: 800, people: 700, margin: 0, empty: 400 };

/** Start time of each block's entrance: blocks arrive in the order the server composed them. */
export function schedule(blocks: Block[]): number[] {
  let t = 0;
  return blocks.map((b) => {
    const at = t;
    t += SPAN[b.type];
    return at;
  });
}

export const ms = (delay: number): CSSProperties => ({ animationDelay: `${delay}ms` });
