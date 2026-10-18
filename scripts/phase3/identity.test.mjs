import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
async function load(path) {
  const bundle = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
}
const { confirmProfileIdentity, identitySuggestions } = await load("lib/identity/confirmation.ts");
const { readCandidates } = await load("lib/retrieval/reader.ts");
const { parseFingerprint } = await load("lib/processing/parse-input.ts");
const input = { requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", snapshotId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  personId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };
const nextRequest = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
function store(initialLinked = []) {
  let state = { receipts: new Map(), current: null, linked: initialLinked, queued: [], fingerprint: null }; let queue = Promise.resolve();
  const snapshot = { contentHash: "a".repeat(64), sourceUrl: "https://www.linkedin.com/in/example/", adapterId: "linkedin", kind: "profile_page" };
  return { snapshot, failQueue: false, inspect: () => structuredClone(state), async transaction(snapshotId, work) {
    const previous = queue; let release; queue = new Promise((resolve) => { release = resolve; }); await previous;
    const proposed = structuredClone(state);
    try {
      const result = await work({
        async confirmation(id) { return proposed.receipts.get(id) ?? null; }, async snapshot() { return snapshot; },
        async canonicalPerson(id) { return id === input.personId; }, async currentProof() { return proposed.current; },
        async noticedPeople() { return proposed.linked; },
        async insertProof(proof, requestId) { proposed.current = proof; proposed.receipts.set(requestId, proof); },
        async linkPerson(id) { proposed.linked = [...new Set([...proposed.linked, id])]; },
        queueParse: async (fingerprint) => { if (this.failQueue) throw new Error("queue unavailable"); proposed.fingerprint = fingerprint; proposed.queued.push(fingerprint); },
      }); state = proposed; return result;
    } finally { release(); }
  } };
}
test("concurrent confirmation retries commit one proof, link and identity-versioned input", async () => {
  const target = store(); const result = await Promise.all([confirmProfileIdentity(input, target), confirmProfileIdentity(input, target)]);
  assert.deepEqual(result.map((r) => r.replayed), [false, true]);
  const state = target.inspect(); assert.equal(state.receipts.size, 1); assert.equal(state.queued.length, 1);
  assert.deepEqual(state.linked, [input.personId]);
  assert.equal(state.fingerprint, parseFingerprint({ ...target.snapshot, identityObservationId: result[0].proof.id }));
});
test("replaying an older request cannot reactivate its proof or processing head", async () => {
  const target = store(); const first = await confirmProfileIdentity(input, target);
  const second = await confirmProfileIdentity({ ...input, requestId: nextRequest }, target);
  assert.equal(second.proof.supersedesId, first.proof.id); assert.notEqual(first.proof.id, second.proof.id);
  const before = target.inspect(); await confirmProfileIdentity(input, target);
  assert.deepEqual(target.inspect(), before);
});
test("changed request payloads and unavailable people are rejected", async () => {
  const target = store(); await confirmProfileIdentity(input, target);
  await assert.rejects(confirmProfileIdentity({ ...input, personId: nextRequest }, target), /REQUEST_CONFLICT/);
  await assert.rejects(confirmProfileIdentity({ ...input, requestId: nextRequest, personId: nextRequest }, target), /PERSON_UNAVAILABLE/);
  assert.equal(target.inspect().queued.length, 1);
});
test("queue failure rolls back identity proof and encounter link together", async () => {
  const target = store(); target.failQueue = true;
  await assert.rejects(confirmProfileIdentity(input, target), /queue unavailable/);
  assert.equal(target.inspect().receipts.size, 0); assert.deepEqual(target.inspect().linked, []);
});

test("a conflicting noticed person is not reassigned or merged automatically", async () => {
  const target = store([nextRequest]); const before = target.inspect();
  await assert.rejects(confirmProfileIdentity(input, target), /REASSIGNMENT_REQUIRES_REVIEW/);
  assert.deepEqual(target.inspect(), before);
});
test("identity confirmation cannot be applied to a social post", async () => {
  const target = store(); target.snapshot.kind = "social_post";
  await assert.rejects(confirmProfileIdentity(input, target), /SNAPSHOT_UNSUPPORTED/);
  assert.equal(target.inspect().receipts.size, 0);
});
test("names, weak keys and conflicting candidates never silently resolve a person", () => {
  assert.equal(identitySuggestions([{ personId: "one", exactKey: false, verified: true, active: true }]).state, "unresolved");
  assert.equal(identitySuggestions([{ personId: "one", exactKey: true, verified: false, active: true }]).state, "unresolved");
  const candidate = { personId: "one", exactKey: true, verified: true, active: true };
  assert.deepEqual(identitySuggestions([candidate, candidate]), { state: "candidate", personIds: ["one"] });
  assert.equal(identitySuggestions([candidate, { ...candidate, personId: "two" }]).state, "conflict");
});
test("obsolete extraction versions and inactive identity proofs are excluded while User text survives", () => {
  const derived = { snapshotId: input.snapshotId, fingerprint: "old", identityObservationId: "proof", representationId: "representation" };
  const data = { objects: [{ id: input.personId, kind: "person" }], encounters: [], links: [], facts: [], locators: [],
    observations: [{ id: "fact", subjectId: input.personId, text: "old school", layer: "extracted", supportStatus: "verified", derivation: derived },
      { id: "note", subjectId: input.personId, text: "my original words", layer: "user", supportStatus: "legacy_unverified" }],
    derivationHeads: [{ snapshotId: input.snapshotId, fingerprint: "new", identityObservationId: "proof", identityActive: true }] };
  const texts = () => readCandidates(data).candidates[0].evidence.map((e) => e.text);
  assert.deepEqual(texts(), ["my original words"]);
  data.derivationHeads[0].fingerprint = "old"; assert.deepEqual(texts(), ["old school", "my original words"]);
  data.derivationHeads[0].identityActive = false; assert.deepEqual(texts(), ["my original words"]);
  data.derivationHeads = []; assert.deepEqual(texts(), ["my original words"]);
});
