import { parseHTML } from "linkedom";

export type Doc = ReturnType<typeof parseHTML>["document"];
export type El = NonNullable<ReturnType<Doc["querySelector"]>>;

export function parseDocument(html: string): Doc {
  return parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
}

const SKIP_TEXT = new Set(["SCRIPT", "STYLE", "BUTTON"]);

function collect(node: El | ChildNode, out: string[]): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) out.push(child.textContent ?? "");
    else if (child.nodeType === 1) {
      const el = child as unknown as El;
      if (el.tagName === "BR") out.push("\n");
      else if (!SKIP_TEXT.has(el.tagName)) collect(el, out);
    }
  }
}

/** Visible text with <br> as newlines. Buttons are skipped (LinkedIn's "… more" lives in one). */
export function blockText(el: El | null | undefined): string | null {
  if (!el) return null;
  const out: string[] = [];
  collect(el, out);
  const text = out
    .join("")
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t​]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text === "" ? null : text;
}

/** Single-line text. */
export function lineText(el: El | null | undefined): string | null {
  const text = blockText(el)?.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

/** Elements matching `selector` inside `root` that are not nested inside another match. */
export function outermost(root: El | Doc, selector: string): El[] {
  const all = Array.from(root.querySelectorAll(selector)) as El[];
  return all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
}

type Strategy<T> = readonly [name: string, run: () => T | null | undefined];

/**
 * Tries strategies in order and records which one won per field, so selector drift shows up
 * in the logs before the last strategy stops working.
 */
export class Trace {
  readonly won: Record<string, string> = {};

  first<T>(field: string, strategies: readonly Strategy<T>[]): T | null {
    for (const [name, run] of strategies) {
      const value = run();
      if (value !== null && value !== undefined) {
        this.won[field] = name;
        return value;
      }
    }
    this.won[field] = "none";
    return null;
  }
}
