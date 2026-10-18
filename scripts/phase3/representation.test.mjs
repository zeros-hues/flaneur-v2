import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["lib/retrieval/representation.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { representation, locateText, sameRepresentation } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const snapshotId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const evidenceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
test("representation preserves exact plaintext; version changes create distinct records", () => {
  const text = "A😀B\r\n  e\u0301";
  const first = representation(snapshotId, "adapter-v1", text);
  assert.equal(first.text, text);
  assert.equal(first.textHash, createHash("sha256").update(text).digest("hex"));
  assert.deepEqual(representation(snapshotId.toUpperCase(), "adapter-v1", text), first);
  assert.notEqual(representation(snapshotId, "adapter-v2", text).id, first.id);
  const changed = representation(snapshotId, "adapter-v1", "different");
  assert.equal(first.id, changed.id);
  assert.equal(sameRepresentation(first, changed), false);
  assert.equal(sameRepresentation(first, first), true);
});
test("locator requires same snapshot, exact excerpt, and Unicode range", () => {
  const source = representation(snapshotId, "v1", "A😀B");
  const evidence = { id: evidenceId, snapshotId, excerpt: "😀" };
  assert.deepEqual(locateText(source, evidence, 1, 2, "😀"), { evidenceId, representationId: source.id, start: 1, end: 2, quote: "😀" });
  for (const altered of [{ ...evidence, snapshotId: evidenceId }, { ...evidence, snapshotId: null }, { ...evidence, excerpt: "different" }])
    assert.throws(() => locateText(source, altered, 1, 2, "😀"), /INVALID_TEXT/);
  assert.throws(() => locateText(source, evidence, 1, 3, "😀"), /INVALID_TEXT/);
});
test("invalid database text and missing version fail before persistence", () => {
  for (const text of ["\0", "\uD800", "\uDC00"]) assert.throws(() => representation(snapshotId, "v1", text), /INVALID/);
  assert.throws(() => representation(snapshotId, " ", "text"), /INVALID/);
  assert.throws(() => representation("not-a-uuid", "v1", "text"), /INVALID/);
});
