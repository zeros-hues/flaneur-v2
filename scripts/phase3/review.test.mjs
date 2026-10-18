import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
async function load(path) {
  const bundle = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
}
const { rejectObservation } = await load("lib/review/rejection.ts");
const { readCandidates } = await load("lib/retrieval/reader.ts");
const { dependentObservationIds } = await load("lib/processing/dependencies.ts");
const request = { requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", observationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", comment: "Incorrect inference" };
function store(layer = "inferred", identityProof = false) {
  let state = { receipts: new Map(), active: true, head: "original", invalidations: 0 }; let tail = Promise.resolve();
  return { failInvalidate: false, inspect: () => structuredClone(state), newerHead() { state.head = "newer"; },
    async transaction(id, work) {
      const previous = tail; let release; tail = new Promise((resolve) => { release = resolve; }); await previous;
      const next = structuredClone(state);
      try {
        const result = await work({ async receipt(key) { return next.receipts.get(key) ?? null; },
          async observation() { return { layer, identityProof, active: next.active }; },
          async insertReview(review) { next.receipts.set(review.id, review); next.active = false; },
          invalidate: async () => { if (this.failInvalidate) throw new Error("invalidation unavailable"); next.head = "withdrawn"; next.invalidations++; },
        }); state = next; return result;
      } finally { release(); }
    },
  };
}
test("concurrent review retries invalidate once; replay does not reset newer heads", async () => {
  const target = store(); const replies = await Promise.all([rejectObservation(request, target), rejectObservation(request, target)]);
  assert.deepEqual(replies.map((reply) => reply.replayed), [false, true]); assert.equal(target.inspect().invalidations, 1);
  target.newerHead(); const before = target.inspect(); await rejectObservation(request, target); assert.deepEqual(target.inspect(), before);
});
test("changed requests, already-reviewed roots and identity proofs cannot use generic review", async () => {
  const target = store(); await rejectObservation(request, target);
  await assert.rejects(rejectObservation({ ...request, comment: "changed" }, target), /REQUEST_CONFLICT/);
  await assert.rejects(rejectObservation({ ...request, requestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }, target), /UNAVAILABLE/);
  await assert.rejects(rejectObservation(request, store("inferred", true)), /IDENTITY_REVIEW_REQUIRED/);
});
test("User text requires authored revision; failed invalidation rolls back the review", async () => {
  await assert.rejects(rejectObservation(request, store("user")), /AUTHORED_TEXT_REQUIRES_REVISION/);
  const target = store(); target.failInvalidate = true; const before = target.inspect();
  await assert.rejects(rejectObservation(request, target), /invalidation unavailable/); assert.deepEqual(target.inspect(), before);
});
test("support closure follows non-User derivations, preserves notes and ignores contradiction edges", () => {
  const nodes = ["root", "child", "grandchild", "note", "independent"].map((id) => ({ id, layer: id === "note" ? "user" : "inferred" }));
  const edges = [{ observationId: "child", supportingObservationId: "root", role: "supports" },
    { observationId: "grandchild", supportingObservationId: "child", role: "supports" },
    { observationId: "note", supportingObservationId: "root", role: "supports" },
    { observationId: "independent", supportingObservationId: "root", role: "contradicts" },
    { observationId: "root", supportingObservationId: "grandchild", role: "supports" }];
  assert.deepEqual([...dependentObservationIds(nodes, edges, ["root"])].sort(), ["child", "grandchild", "root"]);
});
test("rejected input hides descendant inference while original facts and User notes remain recallable", () => {
  const data = { objects: [{ id: "person", kind: "person" }], facts: [], locators: [], links: [], encounters: [],
    observations: [{ id: "root", subjectId: "person", layer: "inferred", text: "career transition", supportStatus: "partial", inactive: true },
      { id: "child", subjectId: "person", layer: "inferred", text: "related generated claim", supportStatus: "partial" },
      { id: "fact", subjectId: "person", layer: "extracted", text: "EPFL", supportStatus: "legacy_unverified" },
      { id: "note", subjectId: "person", layer: "user", text: "my reason", supportStatus: "verified" }],
    dependencies: [{ observationId: "child", supportingObservationId: "root", role: "supports" },
      { observationId: "root", supportingObservationId: "fact", role: "supports" },
      { observationId: "note", supportingObservationId: "root", role: "supports" }] };
  assert.deepEqual(readCandidates(data).candidates[0].evidence.map((item) => item.text), ["EPFL", "my reason"]);
});
test("obsolete parse fields invalidate dependent inference even if no direct review exists", () => {
  const data = { objects: [{ id: "person", kind: "person" }], facts: [], locators: [], links: [], encounters: [],
    observations: [{ id: "field", subjectId: "person", layer: "extracted", text: "old school", supportStatus: "verified",
      derivation: { snapshotId: "snapshot", identityObservationId: "proof", fingerprint: "old", representationId: "text" } },
      { id: "summary", subjectId: "person", layer: "inferred", text: "obsolete summary", supportStatus: "partial" }],
    dependencies: [{ observationId: "summary", supportingObservationId: "field", role: "supports" }],
    derivationHeads: [{ snapshotId: "snapshot", identityObservationId: "proof", fingerprint: "new", identityActive: true }] };
  assert.deepEqual(readCandidates(data).candidates[0].evidence, []);
});
