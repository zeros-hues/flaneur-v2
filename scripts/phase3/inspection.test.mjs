import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["lib/review/inspection.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { inspectionView } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const base = { id: "synthetic", bodyText: "  Exact words 😀  ", layer: "inferred", semanticRole: "note", supportStatus: "partial",
  recordedAt: "2026-10-12T00:00:00Z", supersedesId: null, active: true, identityProof: false, evidence: [], reviews: [] };
test("inspection preserves exact words, truth layer and history rather than upgrading support", () => {
  const row = inspectionView(base); assert.equal(row.bodyText, base.bodyText); assert.equal(row.layer, "inferred");
  assert.equal(row.supportStatus, "partial"); assert.deepEqual(row.actions, { confirm: true, correct: true, reject: true, archive: true });
});
test("inactive and identity observations have no generic review controls; User text requires revision", () => {
  for (const replacement of [{ active: false }, { identityProof: true }])
    assert.equal(Object.values(inspectionView({ ...base, ...replacement }).actions).some(Boolean), false);
  assert.deepEqual(inspectionView({ ...base, layer: "user" }).actions, { confirm: false, correct: true, reject: false, archive: true });
});
test("source excerpt verification uses code points and matching captured source, without returning full source text", () => {
  const evidence = { id: "e", role: "supports", snapshotId: "s", representationSnapshotId: "s", supportingObservationId: null,
    sourceUrl: "https://example.test/source", excerpt: "😀", text: "a😀z", quote: "😀", start: 1, end: 2 };
  const value = inspectionView({ ...base, evidence: [evidence] }).evidence[0];
  assert.equal(value.quoteVerified, true); assert.equal("text" in value, false);
  for (const replacement of [{ end: 3 }, { representationSnapshotId: "other" }, { text: null }])
    assert.equal(inspectionView({ ...base, evidence: [{ ...evidence, ...replacement }] }).evidence[0].quoteVerified, false);
});
test("unsafe source links are removed and invalid authored text cannot be confirmed", () => {
  for (const bodyText of ["", " ", "x".repeat(20001), "unsafe\0", "unsafe\ud800"])
    assert.equal(inspectionView({ ...base, bodyText }).actions.confirm, false);
  for (const sourceUrl of ["javascript:alert(1)", "https://user:private@example.test", "file:///private", "bad"])
    assert.equal(inspectionView({ ...base, evidence: [{ id: "e", role: "supports", snapshotId: null, supportingObservationId: "o",
      sourceUrl, excerpt: null, text: null, quote: null, start: null, end: null, representationSnapshotId: null }] }).evidence[0].sourceUrl, null);
});
