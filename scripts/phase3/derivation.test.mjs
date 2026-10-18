import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
async function load(path) {
  const bundle = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
}
const { extractionBindings } = await load("lib/processing/derivation.ts");
const { readCandidates } = await load("lib/retrieval/reader.ts");
const ids = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "ffffffff-ffff-4fff-8fff-ffffffffffff"];
function fixture() {
  const lease = { jobId: ids[0], snapshotId: ids[1], inputFingerprint: "a".repeat(64), kind: "parse", token: ids[5], expiresAt: 1000 };
  const result = { snapshotId: ids[1], inputFingerprint: lease.inputFingerprint, state: "extracted",
    subject: { personId: ids[2], identityObservationId: ids[3] }, representation: { id: ids[4], snapshotId: ids[1] },
    fields: [{ observationId: ids[5], subjectId: ids[2] }] };
  return { lease, result };
}
test("derivation binds the actual job, identity and normalized representation without aliasing mutable output", () => {
  const { lease, result } = fixture(); const bindings = extractionBindings(lease, result);
  assert.deepEqual(bindings, [{ observationId: ids[5], snapshotId: ids[1], identityObservationId: ids[3],
    jobId: ids[0], representationId: ids[4], inputFingerprint: "a".repeat(64) }]);
  result.subject.identityObservationId = ids[0]; result.representation.id = ids[0];
  assert.equal(bindings[0].identityObservationId, ids[3]); assert.equal(bindings[0].representationId, ids[4]);
});
test("foreign input, non-parse jobs and mismatched normalized snapshots fail before persistence", () => {
  for (const mutate of [({ lease }) => { lease.kind = "index"; }, ({ result }) => { result.inputFingerprint = "b".repeat(64); },
    ({ result }) => { result.snapshotId = ids[0]; }, ({ result }) => { result.representation.snapshotId = ids[0]; }]) {
    const value = fixture(); mutate(value); assert.throws(() => extractionBindings(value.lease, value.result));
  }
});
test("derived fields cannot be unresolved, unowned, duplicated or bound to a malformed job ID", () => {
  for (const mutate of [({ result }) => { result.subject = null; }, ({ result }) => { result.state = "unresolved"; },
    ({ result }) => { result.fields[0].subjectId = ids[0]; }, ({ result }) => { result.fields.push(result.fields[0]); },
    ({ lease }) => { lease.jobId = "legacy-job"; }]) {
    const value = fixture(); mutate(value); assert.throws(() => extractionBindings(value.lease, value.result));
  }
});
test("unresolved and quarantined outputs with no fields create no derivation bindings", () => {
  const { lease, result } = fixture(); result.fields = []; result.subject = null; result.representation = null;
  for (const state of ["unresolved", "quarantined"]) { result.state = state; assert.deepEqual(extractionBindings(lease, result), []); }
});
test("missing relational provenance and ambiguous heads exclude derived text while preserving User notes", () => {
  const data = { objects: [{ id: ids[2], kind: "person" }], locators: [], facts: [], encounters: [], links: [],
    observations: [{ id: ids[5], subjectId: ids[2], layer: "extracted", text: "EPFL", supportStatus: "verified",
      derivation: { snapshotId: null, fingerprint: null, identityObservationId: null, representationId: null } },
    { id: "note", subjectId: ids[2], layer: "user", text: "I noticed their robotics work", supportStatus: "verified" }],
    derivationHeads: [{ snapshotId: ids[1], fingerprint: "a".repeat(64), identityObservationId: ids[3], identityActive: true }] };
  const texts = () => readCandidates(data).candidates[0].evidence.map((item) => item.text);
  assert.deepEqual(texts(), ["I noticed their robotics work"]);
  data.observations[0].derivation = { snapshotId: ids[1], fingerprint: "a".repeat(64), identityObservationId: ids[3], representationId: ids[4] };
  assert.deepEqual(texts(), ["EPFL", "I noticed their robotics work"]);
  data.derivationHeads.push({ ...data.derivationHeads[0] }); assert.deepEqual(texts(), ["I noticed their robotics work"]);
});
test("a locator from another representation cannot verify a current derived assertion", () => {
  const data = { objects: [{ id: ids[2], kind: "person" }], facts: [], encounters: [], links: [],
    observations: [{ id: ids[5], subjectId: ids[2], layer: "extracted", text: "EPFL", supportStatus: "verified",
      derivation: { snapshotId: ids[1], fingerprint: "a".repeat(64), identityObservationId: ids[3], representationId: ids[4] } }],
    derivationHeads: [{ snapshotId: ids[1], fingerprint: "a".repeat(64), identityObservationId: ids[3], identityActive: true }],
    locators: [{ evidenceId: "support", observationId: ids[5], snapshotId: ids[1], representationSnapshotId: ids[1],
      representationId: ids[0], text: "EPFL", start: 0, end: 4, quote: "EPFL", excerpt: "EPFL", role: "supports" }] };
  assert.equal(readCandidates(data).candidates[0].evidence[0].verified, false);
  data.locators[0].representationId = ids[4]; assert.equal(readCandidates(data).candidates[0].evidence[0].verified, true);
  data.locators[0].snapshotId = ids[0]; assert.equal(readCandidates(data).candidates[0].evidence[0].verified, false);
});
