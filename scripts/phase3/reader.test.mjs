import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
async function load(path) {
  const bundle = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
}
const { readCandidates } = await load("lib/retrieval/reader.ts");
const { retrieveEvidence } = await load("lib/retrieval/evidence.ts");
const fixture = () => ({ objects: [{ id: "person", kind: "person" }, { id: "artifact", kind: "artifact" }],
  observations: [{ id: "reason", subjectId: "encounter", layer: "user", text: "robotics", supportStatus: "legacy_unverified" },
    { id: "school", subjectId: "person", layer: "extracted", text: "EPFL", supportStatus: "verified" }],
  facts: [{ observationId: "school", field: "school", value: "EPFL" }],
  locators: [{ evidenceId: "locator", observationId: "school", snapshotId: "snapshot", representationSnapshotId: "snapshot",
    text: "EPFL robotics", start: 0, end: 4, quote: "EPFL", excerpt: "EPFL", role: "supports" }],
  encounters: [{ id: "encounter", snapshotId: "snapshot", occurredAt: "2025-01-01T00:00:00Z", clockVerified: false }],
  links: [{ encounterId: "encounter", objectId: "person", relation: "noticed" }, { encounterId: "encounter", objectId: "artifact", relation: "source" }] });
const request = { mode: "recall", terms: ["robotics"], constraints: [{ field: "school", value: "EPFL" }] };
test("encounter reasons project to linked objects with separate, stable citation IDs", () => {
  const result = readCandidates(fixture());
  const recall = retrieveEvidence(request, result.candidates);
  assert.deepEqual(recall.matches.map((m) => m.candidate.id), ["person"]);
  assert.deepEqual(recall.uncertain.map((m) => m.candidate.id), ["artifact"]);
  const reasons = result.candidates.flatMap((c) => c.evidence.filter((e) => e.provenance.observationId === "reason"));
  assert.equal(new Set(reasons.map((e) => e.id)).size, 2);
  assert.ok(reasons.every((e) => e.verified && e.layer === "user"));
});
test("legacy flags, foreign snapshots, malformed excerpts and contradiction do not verify facts", () => {
  for (const mutation of [
    (d) => { d.observations[1].supportStatus = "legacy_unverified"; },
    (d) => { d.locators[0].representationSnapshotId = "foreign"; },
    (d) => { d.locators[0].end = 5; },
    (d) => { d.locators[0].role = "contradicts"; },
  ]) {
    const data = fixture(); mutation(data);
    assert.equal(retrieveEvidence(request, readCandidates(data).candidates).matches.length, 0);
  }
});
test("projection mismatch cannot confirm a school; unrelated encounters do not attach notes", () => {
  const data = fixture(); data.facts[0].value = "MIT"; data.links[0].relation = "related";
  const candidates = readCandidates(data).candidates;
  assert.equal(candidates.find((c) => c.id === "person").facts.length, 0);
  assert.equal(retrieveEvidence(request, candidates).matches.length, 0);
});
test("empty and temporal-only objects lower indexing coverage; unverified clock remains uncertain", () => {
  const data = fixture(); data.objects.push({ id: "empty", kind: "person" });
  const result = readCandidates(data);
  assert.deepEqual(result.population, { defined: true, total: 3, indexed: 2 });
  const filtered = retrieveEvidence({ ...request, encounteredBetween: { start: "2024-01-01T00:00:00Z", end: "2026-01-01T00:00:00Z" } }, result.candidates);
  assert.equal(filtered.matches.length, 0);
});
test("duplicate objects and assertions fail instead of inflating coverage", () => {
  const data = fixture(); data.objects.push(data.objects[0]); assert.throws(() => readCandidates(data), /DUPLICATE_READER_OBJECT/);
  data.objects.pop(); data.observations.push(data.observations[0]); assert.throws(() => readCandidates(data), /DUPLICATE_READER_OBSERVATION/);
});
