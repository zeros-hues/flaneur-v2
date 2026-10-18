import { parseDocument, type El } from "../parsers/dom";
import { representation } from "./representation";
import { verifiedExcerpt } from "./evidence";
import { TEXT_NORMALIZER_VERSION } from "../processing/parse-input";

export const NORMALIZER_VERSION = TEXT_NORMALIZER_VERSION;
const roots = {
  profile_page: 'section[aria-label="Primary content"]',
  social_post: '[role="listitem"][componentkey^="update-card-focus"]',
} as const;
const skipped = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "SVG", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "NAV"]);
const blocks = new Set(["DIV", "P", "SECTION", "ARTICLE", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "TR", "UL", "OL", "BLOCKQUOTE"]);

/** Captured DOM text, never executed HTML. Explicitly hidden text is omitted; CSS visibility is unknown. */
export function normalizeCapture(snapshotId: string, kind: keyof typeof roots, html: string) {
  if (!(kind in roots) || Buffer.byteLength(html, "utf8") > 10_000_000) throw new Error("INVALID_NORMALIZATION_INPUT");
  const document = parseDocument(html);
  const matches = Array.from(document.querySelectorAll(roots[kind]));
  if (matches.length !== 1) throw new Error("AMBIGUOUS_OR_MISSING_CAPTURE_ROOT");
  const output: string[] = [];
  function walk(node: El, depth: number) {
    if (depth > 256) throw new Error("CAPTURE_NESTING_LIMIT");
    if (skipped.has(node.tagName) || node.hasAttribute("hidden") || node.hasAttribute("inert") ||
        node.getAttribute("aria-hidden")?.toLowerCase() === "true") return;
    if (node.tagName === "BR") { output.push("\n"); return; }
    const boundary = blocks.has(node.tagName);
    if (boundary) output.push("\n");
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) output.push(child.textContent ?? "");
      else if (child.nodeType === 1) walk(child as unknown as El, depth + 1);
    }
    if (boundary) output.push("\n");
  }
  const root = matches[0]!;
  if (root.parentElement?.closest('[hidden], [inert], [aria-hidden="true"]')) throw new Error("HIDDEN_CAPTURE_ROOT");
  walk(root, 0);
  const text = output.join("").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ")
    .split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("EMPTY_CAPTURE_TEXT");
  return representation(snapshotId, `${NORMALIZER_VERSION}:${kind}`, text);
}

/** Exact, unique quote location; repeated text requires explicit positions rather than guessing. */
export function locateUniqueQuote(text: string, quote: string) {
  if (!quote || text.indexOf(quote) < 0 || text.indexOf(quote, text.indexOf(quote) + 1) >= 0)
    throw new Error("AMBIGUOUS_OR_MISSING_QUOTE");
  const offset = text.indexOf(quote);
  const locator = { start: Array.from(text.slice(0, offset)).length,
    end: Array.from(text.slice(0, offset + quote.length)).length, quote };
  if (!verifiedExcerpt(text, locator.start, locator.end, quote)) throw new Error("INVALID_QUOTE_BOUNDARY");
  return locator;
}
