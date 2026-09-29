import { requireCanaries } from "../canary";
import { blockText, lineText, parseDocument, Trace, type El } from "../dom";
import type { ParsedArtifact, ParsedAuthor } from "../types";
import { CANARIES, entityFromHref, ORIGIN, TEXT_BOX, toInt } from "./shared";

function parseAuthor(root: El, trace: Trace): ParsedAuthor | null {
  const name = trace.first("author.name", [
    ["control-menu-label", () => root.querySelector('button[aria-label^="Open control menu for post by "]')
      ?.getAttribute("aria-label")?.replace("Open control menu for post by ", "").trim()],
    ["hide-button-label", () => root.querySelector('button[aria-label^="Hide post by "]')
      ?.getAttribute("aria-label")?.replace("Hide post by ", "").trim()],
  ]);
  if (!name) return null;

  // The actor link wraps a div whose aria-label starts with the name ("Kat Kampf Verified Profile 2nd").
  // Social-context links ("Denise Yang likes this") carry their own name, so they never match.
  const anchor = trace.first<El>("author.link", [
    ["actor-aria-label", () => (Array.from(root.querySelectorAll("a [aria-label]")) as El[])
      .find((el) => el.getAttribute("aria-label")?.startsWith(name))?.closest("a")],
    ["anchor-text", () => (Array.from(root.querySelectorAll("a[href]")) as El[])
      .find((a) => entityFromHref(a.getAttribute("href")) !== null && lineText(a)?.startsWith(name) === true)],
  ]);
  const entity = entityFromHref(anchor?.getAttribute("href"));
  if (!anchor || !entity || entity.kind === "school") return null;

  // The first line after the actor link: a headline for people, a follower count for pages.
  const ordered = Array.from(root.querySelectorAll("a, p")) as El[];
  const next = ordered
    .slice(ordered.indexOf(anchor) + 1)
    .filter((el) => el.tagName === "P" && !anchor.contains(el))
    .map(lineText)
    .find((t) => t !== null && !t.startsWith("•") && t !== name);

  return {
    kind: entity.kind === "in" ? "person" : "organisation",
    name,
    url: `${ORIGIN}/${entity.kind}/${entity.slug}/`,
    slug: entity.slug,
    headline: entity.kind === "in" && next && !/followers$/.test(next) ? next : null,
  };
}

function postType(root: El): ParsedArtifact["postType"] {
  if (root.querySelector("[data-vjs-player], video")) return "video";
  if (root.querySelector('[componentkey^="document-container"]')) return "document";
  if (root.querySelector('a[href*="/pulse/"]')) return "article";
  if (root.querySelector('img[alt="View image"], [data-testid="carousel"]')) return "image";
  return "text";
}

function parseUrn(root: El, url: string, trace: Trace): string | null {
  const URN = /\/feed\/update\/(urn:li:[A-Za-z]+:\d+)/;
  return trace.first("urn", [
    ["source-url", () => URN.exec(url)?.[1]],
    ["update-href", () => URN.exec(root.querySelector('a[href*="/feed/update/urn:li:"]')?.getAttribute("href") ?? "")?.[1]],
    ["comment-key", () => {
      const key = root.querySelector('[componentkey*="urn:li:comment:("]')?.getAttribute("componentkey") ?? "";
      const m = /urn:li:comment:\((activity|ugcPost):(\d+),/.exec(key);
      return m ? `urn:li:${m[1]}:${m[2]}` : null;
    }],
  ]);
}

export function parsePost(html: string, url: string): ParsedArtifact {
  const doc = parseDocument(html);
  requireCanaries(doc, CANARIES.artifact);
  const root = doc.querySelector('[role="listitem"][componentkey^="update-card-focus"]') as El;
  const trace = new Trace();

  const author = parseAuthor(root, trace);
  if (!author) throw new Error("post author could not be resolved");

  const body = (Array.from(root.querySelectorAll(TEXT_BOX)) as El[]).find(
    (el) => !el.closest('[componentkey^="replaceableComment_"], [componentkey^="commentsSectionContainer"]'),
  );
  const hashtags = new Set(
    (Array.from(body?.querySelectorAll('a[href*="keywords=%23"]') ?? []) as El[])
      .map((a) => new URL(a.getAttribute("href") ?? "", ORIGIN).searchParams.get("keywords"))
      .filter((k): k is string => !!k)
      .map((k) => k.replace(/^#/, "").toLowerCase()),
  );

  const reactionCount = trace.first("reactions", [
    ["reactions-label", () => (Array.from(root.querySelectorAll("[id]")) as El[])
      .map((el) => toInt(/^([\d,]+) reactions?$/.exec(lineText(el) ?? "")?.[1]))
      .find((n) => n !== null)],
    ["reaction-button", () => toInt(lineText(root.querySelector('button[aria-label^="Reaction button state"]')))],
  ]);

  return {
    urn: parseUrn(root, url, trace),
    sourceUrl: url,
    author,
    bodyText: blockText(body),
    hashtags: [...hashtags],
    postType: postType(root),
    reactionCount,
    commentCount: toInt(lineText(root.querySelector('[aria-label="Comment"]'))),
    strategies: trace.won,
  };
}
