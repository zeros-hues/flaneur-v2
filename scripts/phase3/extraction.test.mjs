import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
async function load(path) {
  const bundle = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
}
const { extractionProcessor } = await load("lib/processing/extraction.ts");
const { parseFingerprint } = await load("lib/processing/parse-input.ts");
const { workOne } = await load("lib/processing/worker.ts");
const { readCandidates } = await load("lib/retrieval/reader.ts");
const { retrieveEvidence } = await load("lib/retrieval/evidence.ts");
const snapshotId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const personId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const proofId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const profile = (extra = "") => `<section aria-label="Primary content"><h2>Ada 😀</h2><p>robotics</p>
  <section componentkey="EducationTopLevelSection"><a href="/school/epfl/">EPFL</a></section>
  <section componentkey="ExperienceTopLevelSection"><div componentkey="entity-collection-item-1"><p>Research Engineer</p>
    <a href="/company/example/">Example Lab</a></div></section>${extra}</section>`;
function fixture(html = profile()) {
  const snapshot = { id: snapshotId, contentGzip: gzipSync(html), contentHash: createHash("sha256").update(html).digest("hex"),
    sourceUrl: "https://www.linkedin.com/in/ada/", adapterId: "linkedin", kind: "profile_page", subject: { personId, identityObservationId: proofId } };
  const lease = { jobId: "job", snapshotId, kind: "parse", token: "token", expiresAt: 1000,
    inputFingerprint: parseFingerprint({ ...snapshot, identityObservationId: snapshot.subject.identityObservationId }) };
  return { snapshot, lease };
}
test("exact source fields have stable IDs and Unicode locators; changed version affects fingerprint", async () => {
  const { snapshot, lease } = fixture(); const processor = extractionProcessor(async () => snapshot);
  const first = await processor(lease, async () => true);
  assert.deepEqual(first, await processor(lease, async () => true));
  assert.equal(first.outcome, "succeeded");
  assert.deepEqual(first.result.fields.map((field) => [field.field, field.value]), [
    ["school", "EPFL"], ["role", "Research Engineer"], ["organization", "Example Lab"],
  ]);
  for (const field of first.result.fields)
    assert.equal(Array.from(first.result.representation.text).slice(field.start, field.end).join(""), field.quote);
  assert.notEqual(parseFingerprint({ ...snapshot, sourceUrl: "https://www.linkedin.com/in/other/" }), lease.inputFingerprint);
});
test("ambiguous repeated quotes omit fields; grouped roles are not guessed", async () => {
  const { snapshot, lease } = fixture(profile('<p>EPFL</p><section componentkey="ExperienceTopLevelSection"><div componentkey="entity-collection-item-group"><p>Guessed Role</p><ul><li>Grouped</li></ul></div></section>'));
  const { result } = await extractionProcessor(async () => snapshot)(lease, async () => true);
  assert.equal(result.fields.some((field) => field.field === "school"), false);
  assert.equal(result.fields.some((field) => field.value === "Guessed Role"), false);
  assert.equal(result.omittedCount, 1);
});
test("unresolved captures retain normalized evidence without assigning fields to a legacy person", async () => {
  const { snapshot, lease } = fixture(); snapshot.subject = null; lease.inputFingerprint = parseFingerprint(snapshot);
  const { result, outcome } = await extractionProcessor(async () => snapshot)(lease, async () => true);
  assert.equal(result.state, "unresolved"); assert.equal(outcome, "succeeded");
  assert.ok(result.representation); assert.deepEqual(result.fields, []);
});
test("malformed capture roots quarantine processing while retaining the original snapshot", async () => {
  const { snapshot, lease } = fixture("<p>unsupported root</p>"); const before = Buffer.from(snapshot.contentGzip);
  const { result, outcome } = await extractionProcessor(async () => snapshot)(lease, async () => true);
  assert.equal(outcome, "quarantined"); assert.equal(result.code, "NORMALIZATION_FAILED");
  assert.deepEqual(snapshot.contentGzip, before); assert.equal(result.representation, null);
});
test("payload hash, fingerprint and renewal failures prevent output", async () => {
  const { snapshot, lease } = fixture();
  await assert.rejects(extractionProcessor(async () => snapshot)({ ...lease, inputFingerprint: "stale" }, async () => true), /INPUT_MISMATCH/);
  snapshot.contentGzip = gzipSync("different original");
  await assert.rejects(extractionProcessor(async () => snapshot)(lease, async () => true), /HASH_MISMATCH/);
  const valid = fixture();
  await assert.rejects(extractionProcessor(async () => valid.snapshot)(valid.lease, async () => false), /LEASE_LOST/);
});
test("processing output is fenced before synthetic application", async () => {
  const { snapshot, lease } = fixture(); let applied = false;
  const store = { async claim() { return lease; }, async renew() { return true; },
    async complete(current, result, outcome, now) { if (now >= current.expiresAt) return false; applied = true; return true; },
    async fail() { return false; } };
  assert.equal(await workOne(store, extractionProcessor(async () => snapshot), () => 2000), "stale");
  assert.equal(applied, false);
});
test("extracted school evidence and a User note jointly satisfy EPFL-plus-topic Recall", async () => {
  const { snapshot, lease } = fixture();
  const { result } = await extractionProcessor(async () => snapshot)(lease, async () => true);
  const source = result.representation;
  const data = { objects: [{ id: personId, kind: "person" }], encounters: [], links: [],
    derivationHeads: [{ snapshotId, fingerprint: lease.inputFingerprint, identityObservationId: proofId, identityActive: true }],
    observations: result.fields.map((field) => ({ id: field.observationId, subjectId: personId, layer: "extracted", text: field.value, supportStatus: "verified",
      derivation: { snapshotId, fingerprint: lease.inputFingerprint, identityObservationId: proofId, representationId: source.id } })),
    facts: result.fields.map((field) => ({ observationId: field.observationId, field: field.field, value: field.value })),
    locators: result.fields.map((field) => ({ evidenceId: field.evidenceId, observationId: field.observationId,
      snapshotId, representationSnapshotId: source.snapshotId, representationId: source.id, text: source.text, start: field.start, end: field.end,
      quote: field.quote, excerpt: field.quote, role: "supports" })),
  };
  data.observations.push({ id: "note", subjectId: personId, layer: "user", text: "robotics", supportStatus: "legacy_unverified" });
  assert.equal(retrieveEvidence({ mode: "recall", terms: ["robotics"], constraints: [{ field: "school", value: "EPFL" }] }, readCandidates(data).candidates).matches.length, 1);
});

test("identity proof changes invalidate both job input and field IDs without modifying old output", async () => {
  const original = fixture(); const processor = extractionProcessor(async () => original.snapshot);
  const first = await processor(original.lease, async () => true);
  original.snapshot.subject.identityObservationId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  await assert.rejects(processor(original.lease, async () => true), /INPUT_MISMATCH/);
  original.lease.inputFingerprint = parseFingerprint({ ...original.snapshot, identityObservationId: original.snapshot.subject.identityObservationId });
  const second = await processor(original.lease, async () => true);
  assert.equal(first.result.subject.identityObservationId, proofId);
  assert.notEqual(first.result.fields[0].observationId, second.result.fields[0].observationId);
  assert.equal(first.result.fields[0].value, second.result.fields[0].value);
});
