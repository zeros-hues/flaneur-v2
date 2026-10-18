import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const result = await build({ entryPoints: ["lib/migration/phase1-plan.ts"], bundle: true,
  write: false, platform: "node", format: "esm" });
const { planPhase1 } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
const fixture = () => ({ objects: [{ id: "person", kind: "person" }, { id: "post", kind: "artifact" }],
  snapshots: ["save-a", "save-b"].map((id) => ({ id, personId: "person", artifactId: "post",
    capturedAt: "2026-01-01T00:00:00Z", captureType: "post" })),
  notes: [{ id: "note", personId: "person", artifactId: "post", snapshotId: "save-b",
    body: "My current edited note", createdAt: "2026-01-01T00:00:00Z" }], inferences: [] });

test("repeated captures share an artifact but retain distinct stable encounters", () => {
  const input = fixture(); const first = planPhase1(input);
  assert.equal(first.encounters.length, 2);
  assert.notEqual(first.encounters[0].id, first.encounters[1].id);
  assert.equal(first.links.filter((l) => l.objectId === "post").length, 2);
  assert.deepEqual(planPhase1(input), first);
  assert.deepEqual(planPhase1({ ...input, snapshots: [...input.snapshots].reverse() }), first);
});

test("user text and identity survive without inventing original capture wording", () => {
  const plan = planPhase1(fixture()); const observation = plan.observations[0];
  assert.equal(observation.id, "note"); assert.equal(observation.bodyText, "My current edited note");
  assert.equal(observation.truthLayer, "user"); assert.equal(observation.observedAt, null);
  assert.equal(observation.structuredValue.original_capture_wording_unknown, true);
  assert.equal(observation.subjectId, plan.encounters.find((e) => e.snapshotId === "save-b").id);
});

test("unlinked captures and notes remain accounted for", () => {
  const input = fixture(); input.snapshots[0].personId = null; input.snapshots[0].artifactId = null;
  input.notes[0] = { ...input.notes[0], personId: null, artifactId: null, snapshotId: null };
  const plan = planPhase1(input);
  assert.equal(plan.encounters.length, 2); assert.deepEqual(plan.unresolvedNoteIds, ["note"]);
});

test("profile-only capture is flagged for artifact mapping without fabricating an artifact", () => {
  const input = fixture(); input.snapshots[0].captureType = "profile"; input.snapshots[0].artifactId = null;
  const plan = planPhase1(input);
  assert.deepEqual(plan.profileArtifactSnapshotIds, ["save-a"]);
  assert.equal(plan.objectRefs.filter((r) => r.kind === "artifact").length, 1);
});

test("legacy synthesis remains unverified inference with unknown historical input", () => {
  const input = fixture(); input.inferences.push({ key: "person:person:synthesis:legacy",
    subjectId: "person", body: "Generated summary", role: "summary", metadata: { prompt_version: "old" } });
  const observation = planPhase1(input).observations.find((o) => o.truthLayer === "inferred");
  assert.equal(observation.supportStatus, "legacy_unverified"); assert.equal(observation.recordedAt, null);
  assert.equal(observation.structuredValue.historical_input_set_unknown, true);
});

test("cross-subtype and note UUID collisions fail instead of changing identities", () => {
  const input = fixture(); input.objects.push({ id: "person", kind: "artifact" });
  assert.throws(() => planPhase1(input), /ID_COLLISION/);
  const noteInput = fixture(); noteInput.notes[0].id = "person";
  assert.throws(() => planPhase1(noteInput), /ID_COLLISION/);
});

test("dangling source references abort the plan", () => {
  const input = fixture(); input.snapshots[0].personId = "unknown";
  assert.throws(() => planPhase1(input), /INVALID_REFERENCE/);
});
