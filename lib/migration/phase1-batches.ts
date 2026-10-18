import { batch, type MigrationRow } from "./batch";
import type { planPhase1 } from "./phase1-plan";

type Plan = ReturnType<typeof planPhase1>;
const row = (table: string, key: Record<string, unknown>, values: Record<string, unknown>): MigrationRow => ({ table, key, values });

// Dependency order is deliberate. Each batch creates complete subtypes and can commit independently.
// Existing objects are registered by migration 0007, not by an orphan-producing registry batch.
export function phase1Batches(plan: Plan) {
  if (plan.unresolvedNoteIds.length || plan.profileArtifactSnapshotIds.length) {
    throw new Error("PHASE1_UNRESOLVED_BACKFILL_INPUT");
  }
  const batches = [];
  for (const a of plan.profileArtifacts) {
    batches.push(batch(`phase1:v2:profile:${a.id}`, [row("artifact", { id: a.id }, {
      person_id: a.personId, organisation_id: null, type: a.type, source_url: a.sourceUrl,
      migration_key: a.migrationKey, captured_at: a.capturedAt, last_captured_at: a.lastCapturedAt,
    })]));
  }
  for (const e of plan.encounters) {
    batches.push(batch(`phase1:v2:${e.migrationKey}`, [row("encounter", { id: e.id }, {
      kind: e.kind, occurred_at: e.occurredAt, snapshot_id: e.snapshotId,
      migration_key: e.migrationKey, source_context: e.sourceContext,
    }), ...plan.links.filter((l) => l.encounterId === e.id).map((l) => row("encounter_object",
      { encounter_id: l.encounterId, object_id: l.objectId, relation: l.relation }, {}))]));
  }
  for (const o of plan.observations) {
    const values: Record<string, unknown> = { subject_id: o.subjectId, truth_layer: o.truthLayer,
      semantic_role: o.semanticRole, body_text: o.bodyText, observed_at: null,
      support_status: o.supportStatus, origin_key: o.originKey, structured_value: o.structuredValue,
      field_key: o.fieldKey ?? null };
    if (o.recordedAt) values.recorded_at = o.recordedAt;
    const rows = [row("observation", { id: o.id }, values)];
    for (const link of plan.structuredLinks.filter((l) => l.observationId === o.id)) {
      rows.push(row(`${link.kind}_observation`, { [`${link.kind}_id`]: link.rowId,
        observation_id: o.id, field_key: link.fieldKey }, {}));
    }
    batches.push(batch(`phase1:v2:${o.originKey}`, rows));
  }
  for (const r of plan.relationships) {
    batches.push(batch(`phase1:v2:${r.originKey}`, [row("relationship", { id: r.id }, {
      from_object_id: r.fromObjectId, to_object_id: r.toObjectId, predicate: r.predicate,
      state: r.state, origin_key: r.originKey,
    }), ...r.observationIds.map((id) => row("relationship_support", { relationship_id: r.id, observation_id: id }, {}))]));
  }
  if (new Set(batches.map((b) => b.key)).size !== batches.length) throw new Error("PHASE1_DUPLICATE_BATCH_KEY");
  // Do not rewrite snapshot.artifact_id: historical payload/linkage stays intact. The encounter
  // and profile mapping key provide v2 access without altering legacy capture records.
  return batches;
}
