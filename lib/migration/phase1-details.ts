import { migrationId } from "./identity";

export type StructuredRow = { kind: "role" | "education" | "skill"; id: string;
  personId: string; fields: Record<string, unknown> };
export type LegacyAssociation = { key: string; fromId: string; toId: string;
  predicate: "authored_by" | "profile_of" | "employed_by" | "educated_at" |
    "mentions_concept" | "associated_with_concept";
  layer: "source" | "extracted" | "inferred"; metadata: Record<string, unknown> };
export type LegacySchedule = { artifactId: string; lastSurfacedAt: string | null;
  lastAction: string | null; metadata: Record<string, unknown> };
export type LegacyProfileArtifact = { id: string; personId: string | null; sourceUrl: string;
  type: string; migrationKey: string | null };

export function profileMappings(snapshots: { id: string; personId: string | null;
  artifactId: string | null; sourceUrl?: string; captureType: string; capturedAt: string }[],
  existing: LegacyProfileArtifact[]) {
  const artifacts = new Map<string, { id: string; personId: string | null; type: "profile_page";
    sourceUrl: string; migrationKey: string; capturedAt: string; lastCapturedAt: string }>();
  const mappings: { snapshotId: string; artifactId: string }[] = [];
  for (const s of [...snapshots].sort((a, b) => a.id.localeCompare(b.id))) {
    if (s.captureType !== "profile" || s.artifactId || !s.sourceUrl) continue;
    // Preserve meaningful URL variants. Unresolved people are never merged by URL alone.
    const key = `profile:${s.personId ?? `unresolved:${s.id}`}:${s.sourceUrl}`;
    const candidates = existing.filter((a) => a.type === "profile_page" && a.migrationKey === key);
    if (candidates.length > 1) throw new Error("PHASE1_AMBIGUOUS_PROFILE_MAPPING");
    const id = candidates[0]?.id ?? migrationId(key);
    if (candidates[0] && (candidates[0].personId !== s.personId || candidates[0].sourceUrl !== s.sourceUrl)) {
      throw new Error("PHASE1_PROFILE_MAPPING_CONFLICT");
    }
    const previous = artifacts.get(key);
    artifacts.set(key, { id, personId: s.personId, type: "profile_page", sourceUrl: s.sourceUrl,
      migrationKey: key, capturedAt: previous && previous.capturedAt < s.capturedAt ? previous.capturedAt : s.capturedAt,
      lastCapturedAt: previous && previous.lastCapturedAt > s.capturedAt ? previous.lastCapturedAt : s.capturedAt });
    mappings.push({ snapshotId: s.id, artifactId: id });
  }
  return { artifacts: [...artifacts.values()].sort((a, b) => a.id.localeCompare(b.id)), mappings };
}

export function planDetails(rows: StructuredRow[], associations: LegacyAssociation[], schedules: LegacySchedule[]) {
  const observations = [];
  const structuredLinks = [];
  const relationships = new Map<string, { id: string; fromObjectId: string; toObjectId: string;
    predicate: LegacyAssociation["predicate"]; state: "candidate"; originKey: string; observationIds: string[] }>();
  for (const row of [...rows].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`))) {
    for (const [field, value] of Object.entries(row.fields).sort(([a], [b]) => a.localeCompare(b))) {
      if (value === null || value === undefined) continue;
      const originKey = `${row.kind}:${row.id}:${field}:legacy`;
      const id = migrationId(originKey);
      observations.push({ id, subjectId: row.personId, truthLayer: "extracted" as const,
        semanticRole: "fact" as const, bodyText: typeof value === "string" ? value : JSON.stringify(value),
        fieldKey: `${row.kind}:${row.id}:${field}`, observedAt: null, recordedAt: null,
        supportStatus: "legacy_unverified" as const, originKey,
        structuredValue: { legacy_row_id: row.id, field, value, historical_field_evidence_unknown: true } });
      structuredLinks.push({ kind: row.kind, rowId: row.id, observationId: id, fieldKey: field });
    }
  }
  for (const a of [...associations].sort((a, b) => a.key.localeCompare(b.key))) {
    const originKey = `${a.key}:assertion`;
    const observationId = migrationId(originKey);
    observations.push({ id: observationId, subjectId: a.fromId, truthLayer: a.layer,
      semanticRole: "relationship_assertion" as const, bodyText: a.predicate, fieldKey: null,
      observedAt: null, recordedAt: null, supportStatus: "legacy_unverified" as const, originKey,
      structuredValue: { ...a.metadata, to_object_id: a.toId, historical_support_unknown: true } });
    const relationshipKey = `relationship:${a.fromId}:${a.predicate}:${a.toId}`;
    const previous = relationships.get(relationshipKey);
    relationships.set(relationshipKey, { id: migrationId(relationshipKey), fromObjectId: a.fromId,
      toObjectId: a.toId, predicate: a.predicate, state: "candidate", originKey: relationshipKey,
      observationIds: [...(previous?.observationIds ?? []), observationId].sort() });
  }
  for (const s of [...schedules].sort((a, b) => a.artifactId.localeCompare(b.artifactId))) {
    const originKey = `schedule:${s.artifactId}:legacy`;
    observations.push({ id: migrationId(originKey), subjectId: s.artifactId, truthLayer: "inferred" as const,
      semanticRole: "classification" as const, bodyText: "Legacy scheduling state", fieldKey: null,
      observedAt: null, recordedAt: null, supportStatus: "legacy_unverified" as const, originKey,
      structuredValue: { ...s.metadata, last_known_action: s.lastAction, last_known_surface_time: s.lastSurfacedAt,
        action_time_unknown: true, full_attention_history_unknown: true, not_contact_confirmation: true } });
  }
  return { observations, structuredLinks, relationships: [...relationships.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}
