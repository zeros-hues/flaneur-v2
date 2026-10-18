import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
async function load(path) {
  const bundle = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
}
const { correctObservation } = await load("lib/review/correction.ts");
const { readCandidates } = await load("lib/retrieval/reader.ts");
const request = { requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", observationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  bodyText: "  My exact corrected words 😀  ", comment: null };
const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
function store(layer = "inferred", identityProof = false) {
  let state = { active: true, receipts: new Map(), replacements: new Map(), invalidations: 0, head: "original" };
  let tail = Promise.resolve();
  return { failInvalidate: false, inspect: () => structuredClone(state), nextHead() { state.head = "newer"; },
    async transaction(id, work) {
      const previous = tail; let release; tail = new Promise((resolve) => { release = resolve; }); await previous;
      const proposed = structuredClone(state);
      try {
        const result = await work({ async correctionReceipt(key) { return proposed.receipts.get(key) ?? null; },
          async observation() { return { layer, identityProof, active: proposed.active }; },
          async insertReplacement(review) { proposed.replacements.set(review.replacementId, review.bodyText); },
          async insertCorrectionReview(review) { proposed.receipts.set(review.id, review); proposed.active = false; },
          invalidate: async () => { if (this.failInvalidate) throw new Error("invalidate failed"); proposed.invalidations++; proposed.head = "changed"; },
        }); state = proposed; return result;
      } finally { release(); }
    },
  };
}
test("concurrent correction retries create one exact authored revision and review", async () => {
  const target = store(); const replies = await Promise.all([correctObservation(request, target), correctObservation(request, target)]);
  assert.deepEqual(replies.map((reply) => reply.replayed), [false, true]);
  assert.equal(target.inspect().replacements.size, 1); assert.equal(target.inspect().invalidations, 1);
  assert.equal([...target.inspect().replacements.values()][0], request.bodyText);
});
test("historical correction replay cannot reset later heads; changed payloads fail", async () => {
  const target = store(); await correctObservation(request, target); target.nextHead(); const before = target.inspect();
  await correctObservation(request, target); assert.deepEqual(target.inspect(), before);
  for (const change of [{ bodyText: "changed" }, { comment: "changed" }, { observationId: other }])
    await assert.rejects(correctObservation({ ...request, ...change }, target), /REQUEST_CONFLICT/);
  assert.deepEqual(target.inspect(), before);
});
test("invalidation failure rolls back replacement and review together", async () => {
  const target = store(); target.failInvalidate = true; const before = target.inspect();
  await assert.rejects(correctObservation(request, target), /invalidate failed/); assert.deepEqual(target.inspect(), before);
});
test("authored notes can be revised, while identity proofs require dedicated review", async () => {
  assert.equal((await correctObservation(request, store("user"))).replayed, false);
  await assert.rejects(correctObservation(request, store("user", true)), /IDENTITY_REVIEW_REQUIRED/);
  const target = store(); await correctObservation(request, target);
  await assert.rejects(correctObservation({ ...request, requestId: other }, target), /UNAVAILABLE/);
});
test("empty, NUL, malformed Unicode, oversized text and extra fields are rejected before writing", async () => {
  const target = store(); const before = target.inspect();
  for (const bodyText of [" ", "bad\0text", "bad\ud800text", "bad\udc00text", "x".repeat(20001)])
    await assert.rejects(correctObservation({ ...request, bodyText }, target));
  await assert.rejects(correctObservation({ ...request, subjectId: other }, target)); assert.deepEqual(target.inspect(), before);
});
test("replacement stays User and recallable while original and dependent claims become inactive", () => {
  const data = { objects: [{ id: "person", kind: "person" }], facts: [], locators: [], links: [], encounters: [],
    observations: [{ id: "old", subjectId: "person", layer: "extracted", text: "Old school", supportStatus: "verified", inactive: true },
      { id: "dependent", subjectId: "person", layer: "inferred", text: "Old generated claim", supportStatus: "partial" },
      { id: "new", subjectId: "person", layer: "user", text: request.bodyText, supportStatus: "verified" }],
    dependencies: [{ observationId: "dependent", supportingObservationId: "old", role: "supports" }] };
  const evidence = readCandidates(data).candidates[0].evidence;
  assert.equal(evidence.length, 1); assert.equal(evidence[0].layer, "user"); assert.equal(evidence[0].text, request.bodyText);
  assert.deepEqual(readCandidates(data).candidates[0].facts, []);
});
