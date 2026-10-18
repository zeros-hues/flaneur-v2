import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["lib/review/person-archive.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { archivePerson } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const request = { requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", personId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const readerBundle = await build({ entryPoints: ["lib/retrieval/reader.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { readCandidates } = await import(`data:text/javascript;base64,${Buffer.from(readerBundle.outputFiles[0].contents).toString("base64")}`);
function store(available = true) {
  let state = { available, receipts: new Map(), archivedAt: null, invalidations: 0, head: "original" };
  let tail = Promise.resolve();
  return { failInvalidate: false, failReceipt: false, inspect: () => structuredClone(state), nextHead() { state.head = "newer"; },
    async transaction(id, work) {
      const previous = tail; let release; tail = new Promise((resolve) => { release = resolve; }); await previous;
      const proposed = structuredClone(state);
      try {
        const result = await work({ async receipt(key) { return proposed.receipts.get(key) ?? null; },
          async available() { return proposed.available; },
          async archive() { proposed.available = false; proposed.archivedAt = "2026-10-11T00:00:00.000Z"; return proposed.archivedAt; },
          invalidate: async () => { if (this.failInvalidate) throw new Error("invalidate failed"); proposed.invalidations++; proposed.head = "changed"; },
          insertReceipt: async (r) => { if (this.failReceipt) throw new Error("receipt failed");
            proposed.receipts.set(r.key, { fingerprint: r.fingerprint, archivedAt: proposed.archivedAt }); },
        }); state = proposed; return result;
      } finally { release(); }
    },
  };
}
test("concurrent Person archive retries invalidate once and retain the timestamp", async () => {
  const target = store(); const replies = await Promise.all([archivePerson(request, target), archivePerson(request, target)]);
  assert.deepEqual(replies.map((r) => r.replayed), [false, true]); assert.equal(replies[0].archivedAt, replies[1].archivedAt);
  assert.equal(target.inspect().receipts.size, 1); assert.equal(target.inspect().invalidations, 1);
});
test("historical Person archive replay preserves newer work", async () => {
  const target = store(); await archivePerson(request, target); target.nextHead(); const before = target.inspect();
  assert.equal((await archivePerson(request, target)).replayed, true); assert.deepEqual(target.inspect(), before);
});
test("request reuse with another Person fails without writes", async () => {
  const target = store(); await archivePerson(request, target); const before = target.inspect();
  await assert.rejects(archivePerson({ ...request, personId: other }, target), /REQUEST_CONFLICT/); assert.deepEqual(target.inspect(), before);
});
test("failed invalidation or receipt persistence rolls back Person archive", async () => {
  for (const flag of ["failInvalidate", "failReceipt"]) {
    const target = store(); target[flag] = true; const before = target.inspect();
    await assert.rejects(archivePerson(request, target), /failed/); assert.deepEqual(target.inspect(), before);
  }
});
test("unavailable Persons and fresh requests for an archived Person fail", async () => {
  await assert.rejects(archivePerson(request, store(false)), /UNAVAILABLE/);
  const target = store(); await archivePerson(request, target);
  await assert.rejects(archivePerson({ ...request, requestId: other }, target), /UNAVAILABLE/);
});
test("explicit UUID gesture and Person target are required; timestamps cannot be supplied", async () => {
  const target = store(); const before = target.inspect();
  for (const change of [{ requestId: "bad" }, { personId: "bad" }, { archivedAt: "invented" }, { observationId: other }])
    await assert.rejects(archivePerson({ ...request, ...change }, target));
  assert.deepEqual(target.inspect(), before);
});
test("archived Person leaves the population while encounter history and other User notes remain", () => {
  const data = { objects: [{ id: "other", kind: "person" }, { id: "encounter", kind: "encounter" }],
    facts: [], locators: [], encounters: [], links: [{ encounterId: "encounter", objectId: "archived", relation: "noticed" }],
    observations: [{ id: "proof", subjectId: "archived", layer: "user", text: "Historical identity", supportStatus: "verified", inactive: true },
      { id: "own", subjectId: "archived", layer: "user", text: "Retained own note", supportStatus: "verified", inactive: true },
      { id: "child", subjectId: "other", layer: "inferred", text: "Dependent claim", supportStatus: "partial" },
      { id: "note", subjectId: "other", layer: "user", text: "Independent note", supportStatus: "verified" },
      { id: "reason", subjectId: "encounter", layer: "user", text: "Why I saved this", supportStatus: "verified" }],
    dependencies: [{ observationId: "child", supportingObservationId: "proof", role: "supports" },
      { observationId: "note", supportingObservationId: "proof", role: "supports" }] };
  const result = readCandidates(data);
  assert.equal(result.population.total, 2);
  assert.deepEqual(result.candidates.find((c) => c.id === "other").evidence.map((e) => e.text), ["Independent note"]);
  assert.deepEqual(result.candidates.find((c) => c.id === "encounter").evidence.map((e) => e.text), ["Why I saved this"]);
  assert.equal(data.observations.length, 5);
});
