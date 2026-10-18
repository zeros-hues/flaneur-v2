import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["lib/retrieval/normalize.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { normalizeCapture, locateUniqueQuote } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const snapshotId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const wrap = (body) => `<section aria-label="Primary content">${body}</section>`;
test("normalizer isolates captured content, separates blocks and ignores active/hidden controls", () => {
  const html = `<nav>outside</nav>${wrap('<h2>Ada 😀</h2><p>EPFL&nbsp;robotics</p><script>throw new Error("run")</script><style>secret</style><button>Follow</button><div hidden>Hidden</div><p aria-hidden="true">Duplicate</p><p>Source &amp; work<br>line two</p>')}`;
  const first = normalizeCapture(snapshotId, "profile_page", html);
  assert.equal(first.text, "Ada 😀\n\nEPFL robotics\n\nSource & work\nline two");
  assert.deepEqual(normalizeCapture(snapshotId, "profile_page", html), first);
  assert.equal(globalThis.normalizationSideEffect, undefined);
});
test("missing/multiple roots and empty content fail without broad fallback", () => {
  assert.throws(() => normalizeCapture(snapshotId, "profile_page", "<p>outside</p>"), /ROOT/);
  assert.throws(() => normalizeCapture(snapshotId, "profile_page", wrap("a") + wrap("b")), /ROOT/);
  assert.throws(() => normalizeCapture(snapshotId, "profile_page", wrap("<script>only</script>")), /EMPTY/);
});
test("post normalization does not pull unrelated feed cards or comments from another root", () => {
  const html = '<p>outside robotics</p><div role="listitem" componentkey="update-card-focus-1"><p>Saved work</p></div>';
  assert.equal(normalizeCapture(snapshotId, "social_post", html).text, "Saved work");
  assert.throws(() => normalizeCapture(snapshotId, "social_post", html + html), /ROOT/);
});
test("quote location uses code points and refuses duplicate or missing text", () => {
  assert.deepEqual(locateUniqueQuote("A😀 EPFL", "EPFL"), { start: 3, end: 7, quote: "EPFL" });
  assert.throws(() => locateUniqueQuote("EPFL EPFL", "EPFL"), /QUOTE/);
  assert.throws(() => locateUniqueQuote("EPFL", "MIT"), /QUOTE/);
  assert.throws(() => locateUniqueQuote("😀", "\uDE00"), /BOUNDARY/);
});
