import { sql } from "drizzle-orm";
import { check, foreignKey, index, jsonb, pgTable, primaryKey, real, text, unique, uuid } from "drizzle-orm/pg-core";
import { snapshot } from "./artifacts";
import { timestamptz } from "./columns";

// Subtype existence/kind and graph cycles are enforced by the companion SQL migration.
export const objectRef = pgTable("object_ref", {
  id: uuid("id").primaryKey(),
  kind: text("kind").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  archivedAt: timestamptz("archived_at"),
}, (t) => [check("object_ref_kind", sql`${t.kind} in ('person','artifact','concept','organisation','encounter','observation')`)]);

export const encounter = pgTable("encounter", {
  id: uuid("id").primaryKey().references(() => objectRef.id),
  kind: text("kind").notNull(),
  occurredAt: timestamptz("occurred_at").notNull(),
  recordedAt: timestamptz("recorded_at").notNull().defaultNow(),
  snapshotId: uuid("snapshot_id").unique().references(() => snapshot.id),
  sourceContext: jsonb("source_context").$type<Record<string, unknown>>(),
  explicitContextText: text("explicit_context_text"),
  migrationKey: text("migration_key").unique(),
}, (t) => [check("encounter_kind", sql`${t.kind} in ('captured','intentionally_opened','resurfaced','contacted')`),
  index("encounter_occurred_at_idx").on(t.occurredAt)]);

export const encounterObject = pgTable("encounter_object", {
  encounterId: uuid("encounter_id").notNull().references(() => encounter.id),
  objectId: uuid("object_id").notNull().references(() => objectRef.id),
  relation: text("relation").notNull(),
}, (t) => [primaryKey({ columns: [t.encounterId, t.objectId, t.relation] }),
  index("encounter_object_object_idx").on(t.objectId, t.encounterId),
  check("encounter_object_relation", sql`${t.relation} in ('noticed','source','author','related')`)]);

export const observation = pgTable("observation", {
  id: uuid("id").primaryKey().references(() => objectRef.id),
  subjectId: uuid("subject_id").notNull().references(() => objectRef.id),
  truthLayer: text("truth_layer").notNull(),
  semanticRole: text("semantic_role").notNull(),
  bodyText: text("body_text").notNull(),
  structuredValue: jsonb("structured_value").$type<Record<string, unknown>>(),
  fieldKey: text("field_key"),
  observedAt: timestamptz("observed_at"),
  recordedAt: timestamptz("recorded_at").notNull().defaultNow(),
  confidence: real("confidence"),
  supportStatus: text("support_status").notNull(),
  supersedesId: uuid("supersedes_id"),
  originKey: text("origin_key").unique(),
}, (t) => [unique("observation_id_subject_unique").on(t.id, t.subjectId),
  foreignKey({ columns: [t.supersedesId, t.subjectId], foreignColumns: [t.id, t.subjectId],
    name: "observation_revision_subject_fk" }),
  index("observation_subject_role_idx").on(t.subjectId, t.semanticRole, t.recordedAt),
  check("observation_layer", sql`${t.truthLayer} in ('user','source','extracted','inferred')`),
  check("observation_role", sql`${t.semanticRole} in ('reason_for_noticing','note','fact','summary','classification','relationship_assertion','selection_reason')`),
  check("observation_support", sql`${t.supportStatus} in ('verified','partial','legacy_unverified','unsupported')`),
  check("observation_confidence", sql`${t.confidence} between 0 and 1`),
  check("observation_not_self_revision", sql`${t.supersedesId} is distinct from ${t.id}`)]);

export const observationEvidence = pgTable("observation_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  observationId: uuid("observation_id").notNull().references(() => observation.id),
  snapshotId: uuid("snapshot_id").references(() => snapshot.id),
  supportingObservationId: uuid("supporting_observation_id").references(() => observation.id),
  excerpt: text("excerpt"),
  locator: jsonb("locator_json").$type<Record<string, unknown>>(),
  supportRole: text("support_role").notNull(),
  evidenceVersion: text("evidence_version").notNull(),
}, (t) => [index("observation_evidence_observation_idx").on(t.observationId),
  index("observation_evidence_snapshot_idx").on(t.snapshotId),
  index("observation_evidence_supporting_idx").on(t.supportingObservationId),
  check("observation_evidence_one_target", sql`num_nonnulls(${t.snapshotId}, ${t.supportingObservationId}) = 1`),
  check("observation_evidence_not_self", sql`${t.supportingObservationId} is distinct from ${t.observationId}`),
  check("observation_evidence_role", sql`${t.supportRole} in ('supports','contradicts')`)]);
