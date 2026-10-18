import { migrationId } from "./identity";
import { planDetails, profileMappings, type StructuredRow, type LegacyAssociation,
  type LegacySchedule, type LegacyProfileArtifact } from "./phase1-details";
export { migrationId } from "./identity";

type LegacyObject = { id: string; kind: "person" | "artifact" | "concept" | "organisation" };
type LegacySnapshot = { id: string; personId: string | null; artifactId: string | null;
  capturedAt: string; captureType: string; sourceUrl?: string };
type LegacyNote = { id: string; personId: string | null; artifactId: string | null;
  snapshotId: string | null; body: string; createdAt: string };
type LegacyInference = { key: string; subjectId: string; body: string;
  role: "summary" | "classification"; metadata: Record<string, unknown> };
export type Phase1Input = { objects: LegacyObject[]; snapshots: LegacySnapshot[];
  notes: LegacyNote[]; inferences: LegacyInference[]; structuredRows?: StructuredRow[];
  associations?: LegacyAssociation[]; schedules?: LegacySchedule[]; artifacts?: LegacyProfileArtifact[] };
export type PlannedObservation = { id: string; subjectId: string; truthLayer: "user" | "source" | "extracted" | "inferred";
  semanticRole: "note" | "summary" | "classification" | "fact" | "relationship_assertion"; bodyText: string;
  recordedAt: string | null; observedAt: null; supportStatus: "legacy_unverified";
  originKey: string; structuredValue: Record<string, unknown>; fieldKey?: string | null };

export function planPhase1(input: Phase1Input) {
  const refs = new Map<string, string>();
  const register = (id: string, kind: string) => {
    if (refs.has(id)) throw new Error("PHASE1_ID_COLLISION");
    refs.set(id, kind);
  };
  input.objects.forEach((object) => register(object.id, object.kind));
  const profiles = profileMappings(input.snapshots, input.artifacts ?? []);
  for (const a of profiles.artifacts) {
    if (!refs.has(a.id)) register(a.id, "artifact");
    else if (!(input.artifacts ?? []).some((existing) => existing.id === a.id && existing.migrationKey === a.migrationKey)) {
      throw new Error("PHASE1_ID_COLLISION");
    }
  }
  const mappedArtifacts = new Map(profiles.mappings.map((m) => [m.snapshotId, m.artifactId]));
  const requireObject = (id: string | null, kind: string) => {
    if (id && refs.get(id) !== kind) throw new Error("PHASE1_INVALID_REFERENCE");
  };
  const snapshots = new Map(input.snapshots.map((s) => [s.id, s]));
  if (snapshots.size !== input.snapshots.length) throw new Error("PHASE1_DUPLICATE_SNAPSHOT");
  const encounterBySnapshot = new Map<string, string>();
  const encounters = [...input.snapshots].sort((a, b) => a.id.localeCompare(b.id)).map((s) => {
    requireObject(s.personId, "person"); requireObject(s.artifactId, "artifact");
    const migrationKey = `snapshot:${s.id}:capture`;
    const id = migrationId(migrationKey);
    register(id, "encounter"); encounterBySnapshot.set(s.id, id);
    return { id, kind: "captured" as const, occurredAt: s.capturedAt, snapshotId: s.id,
      migrationKey, sourceContext: { legacy_capture_type: s.captureType, migration_version: 1 } };
  });
  const links = input.snapshots.flatMap((s) => [
    ...(s.personId ? [{ encounterId: encounterBySnapshot.get(s.id)!, objectId: s.personId, relation: "noticed" }] : []),
    ...((s.artifactId ?? mappedArtifacts.get(s.id)) ? [{ encounterId: encounterBySnapshot.get(s.id)!,
      objectId: (s.artifactId ?? mappedArtifacts.get(s.id))!, relation: "source" }] : []),
  ]).sort((a, b) => `${a.encounterId}:${a.objectId}`.localeCompare(`${b.encounterId}:${b.objectId}`));
  const unresolvedNoteIds: string[] = [];
  const observations: PlannedObservation[] = [];
  const inferenceLinks: { kind: "role"; rowId: string; observationId: string; fieldKey: string }[] = [];
  for (const n of [...input.notes].sort((a, b) => a.id.localeCompare(b.id))) {
    requireObject(n.personId, "person"); requireObject(n.artifactId, "artifact");
    if (n.snapshotId && !snapshots.has(n.snapshotId)) throw new Error("PHASE1_MISSING_SNAPSHOT");
    const subjectId = (n.snapshotId ? encounterBySnapshot.get(n.snapshotId) : null) ?? n.artifactId ?? n.personId;
    if (!subjectId) { unresolvedNoteIds.push(n.id); continue; }
    register(n.id, "observation");
    observations.push({ id: n.id, subjectId, truthLayer: "user", semanticRole: "note",
      bodyText: n.body, recordedAt: null, observedAt: null, supportStatus: "legacy_unverified",
      originKey: `note:${n.id}:current`, structuredValue: { legacy_note_id: n.id,
        original_capture_wording_unknown: true, original_edit_time_unknown: true, legacy_note_created_at: n.createdAt,
        legacy_person_id: n.personId, legacy_artifact_id: n.artifactId } });
  }
  for (const inference of [...input.inferences].sort((a, b) => a.key.localeCompare(b.key))) {
    if (!refs.has(inference.subjectId)) throw new Error("PHASE1_INVALID_REFERENCE");
    const id = migrationId(inference.key); register(id, "observation");
    const rowId = inference.metadata.legacy_role_id;
    const field = inference.metadata.field;
    const fieldKey = typeof rowId === "string" && typeof field === "string" ? `role:${rowId}:${field}` : null;
    if (fieldKey && typeof rowId === "string" && typeof field === "string") {
      inferenceLinks.push({ kind: "role", rowId, observationId: id, fieldKey: field });
    }
    observations.push({ id, subjectId: inference.subjectId, truthLayer: "inferred",
      semanticRole: inference.role, bodyText: inference.body, recordedAt: null, observedAt: null,
      supportStatus: "legacy_unverified", originKey: inference.key, fieldKey,
      structuredValue: { ...inference.metadata, historical_input_set_unknown: true } });
  }
  const profileAssociations: LegacyAssociation[] = profiles.artifacts.flatMap((a) => a.personId ? [{
    key: `profile:${a.id}:subject`, fromId: a.id, toId: a.personId, predicate: "profile_of" as const,
    layer: "extracted" as const, metadata: { historical_person_resolution_unverified: true } }] : []);
  for (const row of input.structuredRows ?? []) requireObject(row.personId, "person");
  const details = planDetails(input.structuredRows ?? [], [...(input.associations ?? []), ...profileAssociations], input.schedules ?? []);
  for (const o of details.observations) {
    if (!refs.has(o.subjectId)) throw new Error("PHASE1_INVALID_REFERENCE");
    register(o.id, "observation"); observations.push(o);
  }
  for (const r of details.relationships) {
    if (!refs.has(r.toObjectId)) throw new Error("PHASE1_INVALID_REFERENCE");
    const fromKind = refs.get(r.fromObjectId), toKind = refs.get(r.toObjectId);
    const valid = r.predicate === "authored_by" ? fromKind === "artifact" && ["person", "organisation"].includes(toKind!)
      : r.predicate === "profile_of" ? fromKind === "artifact" && toKind === "person"
      : r.predicate === "mentions_concept" ? fromKind === "artifact" && toKind === "concept"
      : r.predicate === "associated_with_concept" ? ["person", "artifact", "organisation"].includes(fromKind!) && toKind === "concept"
      : fromKind === "person" && toKind === "organisation";
    if (!valid || r.fromObjectId === r.toObjectId) throw new Error("PHASE1_INVALID_RELATIONSHIP_ENDPOINTS");
  }
  return { version: 2, objectRefs: [...refs].sort(([a], [b]) => a.localeCompare(b))
    .map(([id, kind]) => ({ id, kind })), encounters, links, observations,
    unresolvedNoteIds, profileArtifacts: profiles.artifacts, snapshotArtifactMappings: profiles.mappings,
    structuredLinks: [...details.structuredLinks, ...inferenceLinks], relationships: details.relationships,
    profileArtifactSnapshotIds: input.snapshots.filter((s) => s.captureType === "profile"
      && !s.artifactId && !mappedArtifacts.has(s.id)).map((s) => s.id).sort() };
}
