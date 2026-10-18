import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
async function load(path) {
  const bundle = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
}
const { rejectProfileIdentity } = await load("lib/identity/rejection.ts");
const { parseFingerprint } = await load("lib/processing/parse-input.ts");
const request = { requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", snapshotId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  observationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", comment: "Wrong profile" };
const other = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
function store(active = [request.observationId]) {
  let state = { receipts: new Map(), active, queued: [], head: "old-input", jobs: [{ fingerprint: "old-input", state: "leased" }] };
  let tail = Promise.resolve();
  const snapshot = { contentHash: "a".repeat(64), sourceUrl: "https://www.linkedin.com/in/example/", adapterId: "linkedin", kind: "profile_page" };
  return { snapshot, failQueue: false, inspect: () => structuredClone(state), replaceProof() { state.active = [other]; state.head = "new-input"; },
    async transaction(snapshotId, work) {
      const previous = tail; let release; tail = new Promise((resolve) => { release = resolve; }); await previous;
      const proposed = structuredClone(state);
      try {
        const result = await work({ async receipt(id) { return proposed.receipts.get(id) ?? null; },
          async activeProofIds() { return proposed.active; }, async snapshot() { return snapshot; },
          async insertReview(review) { proposed.receipts.set(review.id, review); proposed.active = []; },
          queueParse: async (fingerprint) => {
            if (this.failQueue) throw new Error("queue unavailable");
            proposed.head = fingerprint; proposed.queued.push(fingerprint);
            for (const job of proposed.jobs) if (job.fingerprint !== fingerprint) job.state = "superseded";
          },
        }); state = proposed; return result;
      } finally { release(); }
    },
  };
}
test("concurrent rejection retries commit one review and unresolved head", async () => {
  const target = store(); const responses = await Promise.all([rejectProfileIdentity(request, target), rejectProfileIdentity(request, target)]);
  assert.deepEqual(responses.map((response) => response.replayed), [false, true]);
  const state = target.inspect(); assert.equal(state.receipts.size, 1); assert.equal(state.queued.length, 1);
  assert.deepEqual(state.active, []); assert.equal(state.head, parseFingerprint({ ...target.snapshot, identityObservationId: null }));
  assert.equal(state.jobs[0].state, "superseded");
});
test("historical rejection replay cannot invalidate a later proof or reset its head", async () => {
  const target = store(); await rejectProfileIdentity(request, target); target.replaceProof();
  const before = target.inspect(); const result = await rejectProfileIdentity(request, target);
  assert.equal(result.replayed, true); assert.deepEqual(target.inspect(), before);
});
test("review and head invalidation roll back together when queueing fails", async () => {
  const target = store(); target.failQueue = true; const before = target.inspect();
  await assert.rejects(rejectProfileIdentity(request, target), /queue unavailable/); assert.deepEqual(target.inspect(), before);
});
test("stale, absent and ambiguous proofs cannot reject newer identity choices", async () => {
  for (const active of [[], [other], [request.observationId, other]]) {
    const target = store(active); const before = target.inspect();
    await assert.rejects(rejectProfileIdentity(request, target), /STALE_OR_AMBIGUOUS/); assert.deepEqual(target.inspect(), before);
  }
});
test("review retries cannot change the proof, snapshot or comment", async () => {
  const target = store(); await rejectProfileIdentity(request, target); const before = target.inspect();
  for (const changed of [{ observationId: other }, { snapshotId: other }, { comment: "Different intent" }])
    await assert.rejects(rejectProfileIdentity({ ...request, ...changed }, target), /REQUEST_CONFLICT/);
  assert.deepEqual(target.inspect(), before);
});
test("a fresh request cannot reject the same already-reviewed proof", async () => {
  const target = store(); await rejectProfileIdentity(request, target);
  await assert.rejects(rejectProfileIdentity({ ...request, requestId: other }, target), /STALE_OR_AMBIGUOUS/);
  assert.equal(target.inspect().receipts.size, 1);
});
test("unsupported snapshots and malformed explicit requests do not write", async () => {
  const target = store(); const before = target.inspect(); target.snapshot.kind = "social_post";
  await assert.rejects(rejectProfileIdentity(request, target), /SNAPSHOT_UNSUPPORTED/);
  await assert.rejects(rejectProfileIdentity({ ...request, decision: "confirmed" }, target));
  await assert.rejects(rejectProfileIdentity({ ...request, comment: "x".repeat(2001) }, target));
  assert.deepEqual(target.inspect(), before);
});
