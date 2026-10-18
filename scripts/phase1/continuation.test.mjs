import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}
const { planPhase1 } = await load("lib/migration/phase1-plan.ts");
const { phase1Batches } = await load("lib/migration/phase1-batches.ts");
const { batch, writeBatch, canonical } = await load("lib/migration/batch.ts");
const { cooccurrence } = await load("lib/migration/cooccurrence.ts");
const { sourceCandidates } = await load("lib/migration/source-candidates.ts");
const { reconcileBatches } = await load("lib/migration/reconciliation.ts");
const fixture = () => ({ objects: [{ id: "person", kind: "person" }], snapshots: ["a", "b"].map((id) => ({ id,
  personId: "person", artifactId: null, sourceUrl: "https://example.test/person", captureType: "profile",
  capturedAt: "2026-01-01T00:00:00.000Z" })), notes: [], inferences: [] });

test("same supported legacy person/exact profile URL has one artifact and two encounters", () => {
  const plan = planPhase1(fixture());
  assert.equal(plan.profileArtifacts.length, 1); assert.equal(plan.profileArtifacts[0].type, "profile_page");
  assert.equal(plan.encounters.length, 2); assert.equal(plan.snapshotArtifactMappings.length, 2);
  assert.equal(plan.profileArtifactSnapshotIds.length, 0);
  assert.equal(plan.relationships[0].state, "candidate");
});
test("meaningful URL variants and unresolved people do not collapse", () => {
  const input = fixture(); input.snapshots[1].sourceUrl += "?project=other";
  assert.equal(planPhase1(input).profileArtifacts.length, 2);
  input.snapshots[1].sourceUrl = input.snapshots[0].sourceUrl;
  input.snapshots.forEach((s) => { s.personId = null; });
  assert.equal(planPhase1(input).profileArtifacts.length, 2);
});
test("existing profile mapping is reused without creating new identity", () => {
  const input = fixture(); const original = planPhase1(input).profileArtifacts[0];
  input.artifacts = [original]; input.objects.push({ id: original.id, kind: "artifact" });
  assert.equal(planPhase1(input).profileArtifacts[0].id, original.id);
});
test("structured fields preserve uncertain precision and unavailable evidence", () => {
  const input = fixture(); input.structuredRows = [{ kind: "role", id: "role", personId: "person",
    fields: { start_date: "2020-01-01", start_precision: "year", title: "Researcher", end_date: null } }];
  const plan = planPhase1(input); const date = plan.observations.find((o) => o.fieldKey === "role:role:start_precision");
  assert.equal(date.bodyText, "year"); assert.equal(date.truthLayer, "extracted");
  assert.equal(date.supportStatus, "legacy_unverified"); assert.equal(plan.structuredLinks.length, 3);
});
test("legacy scheduling is preserved without inventing attention or contact events", () => {
  const input = fixture(); input.objects.push({ id: "post", kind: "artifact" });
  input.schedules = [{ artifactId: "post", lastSurfacedAt: null, lastAction: "say_hello", metadata: {} }];
  const observation = planPhase1(input).observations.find((o) => o.originKey.startsWith("schedule:"));
  assert.equal(observation.observedAt, null); assert.equal(observation.structuredValue.not_contact_confirmation, true);
  assert.equal(observation.structuredValue.action_time_unknown, true);
});

function memoryStore() {
  const state = { receipts: new Map(), rows: new Map(), failOn: null };
  return { state, async transaction(work) {
    const receipts = new Map(state.receipts); const rows = new Map(state.rows);
    const output = await work({ async receipt(key) { return receipts.get(key) ?? null; },
      async ensure(row) {
        if (row.table === state.failOn) throw new Error("simulated interruption");
        const key = `${row.table}:${canonical(row.key)}`; const contents = canonical(row.values);
        if (rows.has(key) && rows.get(key) !== contents) throw new Error("PHASE1_EXISTING_ROW_CONFLICT");
        rows.set(key, contents);
      }, async commitReceipt(key, hash) { receipts.set(key, hash); } });
    state.receipts = receipts; state.rows = rows; return output;
  } };
}
test("a committed batch retries without duplicate rows", async () => {
  const store = memoryStore(); const input = phase1Batches(planPhase1(fixture()));
  for (const b of input) assert.equal(await writeBatch(store, b), "committed");
  const count = store.state.rows.size;
  for (const b of input) assert.equal(await writeBatch(store, b), "already_committed");
  assert.equal(store.state.rows.size, count);
});
test("interruption rolls back the whole batch and resumes after prior receipts", async () => {
  const store = memoryStore(); const batches = phase1Batches(planPhase1(fixture()));
  await writeBatch(store, batches[0]); const count = store.state.rows.size;
  store.state.failOn = "encounter_object";
  await assert.rejects(writeBatch(store, batches[1]), /interruption/);
  assert.equal(store.state.rows.size, count); assert.equal(store.state.receipts.size, 1);
  store.state.failOn = null; await writeBatch(store, batches[1]);
  assert.equal(store.state.receipts.size, 2);
});
test("changed input under an existing checkpoint fails instead of silently skipping", async () => {
  const store = memoryStore(); const original = batch("key", [{ table: "observation", key: { id: "note" }, values: { body: "old" } }]);
  await writeBatch(store, original);
  await assert.rejects(writeBatch(store, batch("key", [{ ...original.rows[0], values: { body: "edited" } }])), /CHECKPOINT_CONFLICT/);
});
test("existing target mismatch rolls back and leaves no receipt", async () => {
  const store = memoryStore(); await writeBatch(store, batch("old", [{ table: "artifact", key: { id: "a" }, values: { type: "post" } }]));
  await assert.rejects(writeBatch(store, batch("new", [{ table: "artifact", key: { id: "a" }, values: { type: "profile_page" } }])), /ROW_CONFLICT/);
  assert.equal(store.state.receipts.has("new"), false);
});
test("duplicate assertions/captures do not inflate authoritative co-occurrence", () => {
  const links = [{ artifactId: "a", conceptId: "x", active: true }, { artifactId: "a", conceptId: "y", active: true },
    { artifactId: "a", conceptId: "x", active: true }, { artifactId: "b", conceptId: "y", active: false }];
  assert.deepEqual(cooccurrence(links).pairs, [{ conceptAId: "x", conceptBId: "y", count: 1 }]);
  assert.deepEqual(cooccurrence(links).frequencies, [{ conceptId: "x", count: 1 }, { conceptId: "y", count: 1 }]);
  assert.deepEqual(cooccurrence([...links].reverse()), cooccurrence(links));
});
test("conflicting source keys are reported without merging different objects", () => {
  const report = sourceCandidates([{ objectId: "a", kind: "artifact", url: "https://example.test/a", urn: "urn:example:1" },
    { objectId: "b", kind: "artifact", url: "https://example.test/b", urn: "urn:example:1" }]);
  assert.equal(report.candidates.length, 2); assert.equal(report.conflictingKeys, 1);
  assert.ok(report.candidates.every((c) => c.needsEvidenceReview));
});
test("reconciliation distinguishes exact matches, omissions, and changed user text", async () => {
  const rows = ["match", "missing", "edited"].map((id) => ({ table: "observation", key: { id }, values: { body: "original" } }));
  const report = await reconcileBatches([batch("reconcile", rows)], async (r) => r.key.id === "missing" ? null :
    { ...r.key, body: r.key.id === "edited" ? "changed" : "original" });
  assert.deepEqual(report, { expected: 3, matched: 1, missing: 1, conflicting: 1 });
});
test("invalid relationship kinds cannot turn a concept into an author", () => {
  const input = fixture(); input.objects.push({ id: "concept", kind: "concept" });
  input.associations = [{ key: "bad", fromId: "person", toId: "concept", predicate: "authored_by", layer: "extracted", metadata: {} }];
  assert.throws(() => planPhase1(input), /INVALID_RELATIONSHIP_ENDPOINTS/);
});
test("independent assertions support one logical relationship without duplicate edges", () => {
  const input = fixture(); input.objects.push({ id: "org", kind: "organisation" });
  input.associations = ["role-a", "role-b"].map((key) => ({ key, fromId: "person", toId: "org",
    predicate: "employed_by", layer: "extracted", metadata: { legacy_role_id: key } }));
  const relationship = planPhase1(input).relationships.find((r) => r.predicate === "employed_by");
  assert.equal(relationship.observationIds.length, 2);
  assert.equal(planPhase1(input).relationships.filter((r) => r.predicate === "employed_by").length, 1);
});
test("unresolved user data prevents an incomplete write manifest", () => {
  const input = fixture(); input.notes = [{ id: "unlinked", personId: null, artifactId: null, snapshotId: null,
    body: "Retain this note", createdAt: "2026-01-01T00:00:00.000Z" }];
  assert.throws(() => phase1Batches(planPhase1(input)), /UNRESOLVED_BACKFILL_INPUT/);
});
