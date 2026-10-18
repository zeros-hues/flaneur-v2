import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["lib/review/archive.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { archiveObservation } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const request = { requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", observationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const readerBundle = await build({ entryPoints: ["lib/retrieval/reader.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { readCandidates } = await import(`data:text/javascript;base64,${Buffer.from(readerBundle.outputFiles[0].contents).toString("base64")}`);
function store(identityProof = false) {
  let state = { active: true, receipts: new Map(), archivedAt: null, invalidations: 0, head: "original" };
  let tail = Promise.resolve();
  return { failInvalidate: false, failReceipt: false, inspect: () => structuredClone(state), nextHead() { state.head = "newer"; },
    async transaction(id, work) {
      const previous = tail; let release; tail = new Promise((resolve) => { release = resolve; }); await previous;
      const proposed = structuredClone(state);
      try {
        const result = await work({ async receipt(key) { return proposed.receipts.get(key) ?? null; },
          async observation() { return { active: proposed.active, identityProof }; },
          async archive() { proposed.active = false; proposed.archivedAt = "2026-10-11T00:00:00.000Z"; return proposed.archivedAt; },
          invalidate: async () => { if (this.failInvalidate) throw new Error("invalidate failed"); proposed.invalidations++; proposed.head = "changed"; },
          insertReceipt: async (r) => { if (this.failReceipt) throw new Error("receipt failed");
            proposed.receipts.set(r.key, { fingerprint: r.fingerprint, archivedAt: proposed.archivedAt }); },
        }); state = proposed; return result;
      } finally { release(); }
    },
  };
}
test("concurrent archive retries invalidate once and retain the timestamp", async () => {
  const target = store(); const replies = await Promise.all([archiveObservation(request, target), archiveObservation(request, target)]);
  assert.deepEqual(replies.map((r) => r.replayed), [false, true]); assert.equal(replies[0].archivedAt, replies[1].archivedAt);
  assert.equal(target.inspect().receipts.size, 1); assert.equal(target.inspect().invalidations, 1);
});
test("historical archive replay never resets newer work", async () => {
  const target = store(); await archiveObservation(request, target); target.nextHead(); const before = target.inspect();
  assert.equal((await archiveObservation(request, target)).replayed, true); assert.deepEqual(target.inspect(), before);
});
test("request reuse with another observation fails without writes", async () => {
  const target = store(); await archiveObservation(request, target); const before = target.inspect();
  await assert.rejects(archiveObservation({ ...request, observationId: other }, target), /REQUEST_CONFLICT/);
  assert.deepEqual(target.inspect(), before);
});
test("failed invalidation or receipt insertion rolls back the archive", async () => {
  for (const flag of ["failInvalidate", "failReceipt"]) {
    const target = store(); target[flag] = true; const before = target.inspect();
    await assert.rejects(archiveObservation(request, target), /failed/); assert.deepEqual(target.inspect(), before);
  }
});
test("identity proofs and inactive observations cannot be archived through this path", async () => {
  await assert.rejects(archiveObservation(request, store(true)), /IDENTITY_REVIEW_REQUIRED/);
  const target = store(); await archiveObservation(request, target);
  await assert.rejects(archiveObservation({ ...request, requestId: other }, target), /UNAVAILABLE/);
});
test("only an explicit UUID gesture and target are accepted", async () => {
  const target = store(); const before = target.inspect();
  for (const change of [{ requestId: "bad" }, { observationId: "bad" }, { archivedAt: "invented" }, { bodyText: "changed" }])
    await assert.rejects(archiveObservation({ ...request, ...change }, target));
  assert.deepEqual(target.inspect(), before);
});
test("archived input withdraws derived claims while retaining independent User notes", () => {
  const data = { objects: [{ id: "person", kind: "person" }], facts: [], locators: [], encounters: [], links: [],
    observations: [{ id: "root", subjectId: "person", layer: "source", text: "Old source", supportStatus: "verified", inactive: true },
      { id: "child", subjectId: "person", layer: "inferred", text: "Dependent claim", supportStatus: "partial" },
      { id: "note", subjectId: "person", layer: "user", text: "My retained note", supportStatus: "verified" }],
    dependencies: [{ observationId: "child", supportingObservationId: "root", role: "supports" },
      { observationId: "note", supportingObservationId: "root", role: "supports" }] };
  assert.deepEqual(readCandidates(data).candidates[0].evidence.map((item) => item.text), ["My retained note"]);
  assert.equal(data.observations.length, 3);
});
