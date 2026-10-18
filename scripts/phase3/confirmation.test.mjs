import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["lib/review/confirmation.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { confirmObservation } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const request = { requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", observationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
function store(layer = "inferred", identityProof = false, bodyText = "  Exact stored words 😀  ") {
  let state = { active: true, receipts: new Map(), replacements: new Map(), invalidations: 0, head: "original" };
  let tail = Promise.resolve();
  return { failInvalidate: false, inspect: () => structuredClone(state), nextHead() { state.head = "newer"; },
    async transaction(id, work) {
      const previous = tail; let release; tail = new Promise((resolve) => { release = resolve; }); await previous;
      const proposed = structuredClone(state);
      try {
        const result = await work({ async confirmationReceipt(key) { return proposed.receipts.get(key) ?? null; },
          async observation() { return { layer, identityProof, bodyText, active: proposed.active }; },
          async insertConfirmationReplacement(review) { proposed.replacements.set(review.replacementId, review.bodyText); },
          async insertConfirmationReview(review) { proposed.receipts.set(review.id, review); proposed.active = false; },
          invalidate: async () => { if (this.failInvalidate) throw new Error("invalidate failed"); proposed.invalidations++; proposed.head = "changed"; },
        }); state = proposed; return result;
      } finally { release(); }
    },
  };
}
test("concurrent retries confirm stored text once", async () => {
  const target = store(); const results = await Promise.all([confirmObservation(request, target), confirmObservation(request, target)]);
  assert.deepEqual(results.map((r) => r.replayed), [false, true]);
  assert.equal(results[0].review.bodyText, "  Exact stored words 😀  ");
  assert.equal(target.inspect().replacements.size, 1); assert.equal(target.inspect().invalidations, 1);
});
test("historical replay preserves later heads and rejects changed requests", async () => {
  const target = store(); await confirmObservation(request, target); target.nextHead(); const before = target.inspect();
  await confirmObservation(request, target); assert.deepEqual(target.inspect(), before);
  for (const change of [{ comment: "changed" }, { observationId: other }])
    await assert.rejects(confirmObservation({ ...request, ...change }, target), /REQUEST_CONFLICT/);
  assert.deepEqual(target.inspect(), before);
});
test("invalidation failure rolls back confirmation and replacement", async () => {
  const target = store(); target.failInvalidate = true; const before = target.inspect();
  await assert.rejects(confirmObservation(request, target), /invalidate failed/); assert.deepEqual(target.inspect(), before);
});
test("only active source, extracted and inferred assertions can be confirmed", async () => {
  for (const layer of ["source", "extracted", "inferred"]) assert.equal((await confirmObservation(request, store(layer))).replayed, false);
  await assert.rejects(confirmObservation(request, store("user")), /REQUIRES_REVISION/);
  await assert.rejects(confirmObservation(request, store("source", true)), /IDENTITY_REVIEW_REQUIRED/);
  const target = store(); await confirmObservation(request, target);
  await assert.rejects(confirmObservation({ ...request, requestId: other }, target), /UNAVAILABLE/);
});
test("request cannot replace stored text or inject metadata", async () => {
  const target = store(); const before = target.inspect();
  for (const change of [{ bodyText: "invented" }, { structuredValue: {} }, { requestId: "bad" }, { comment: "x".repeat(2001) }])
    await assert.rejects(confirmObservation({ ...request, ...change }, target));
  assert.deepEqual(target.inspect(), before);
});
test("unsupported stored text fails without truncation or writes", async () => {
  for (const body of [" ", "bad\0text", "bad\ud800text", "bad\udc00text", "x".repeat(20001)]) {
    const target = store("source", false, body); const before = target.inspect();
    await assert.rejects(confirmObservation(request, target), /TEXT_UNSUPPORTED/); assert.deepEqual(target.inspect(), before);
  }
});
