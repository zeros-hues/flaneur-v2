import { sql } from "drizzle-orm";
import { check, index, pgTable, real, text, unique, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./columns";
import { objectRef, observation } from "./memory";

export const sourceIdentity = pgTable("source_identity", {
  id: uuid("id").primaryKey().defaultRandom(),
  objectId: uuid("object_id").notNull().references(() => objectRef.id),
  adapterId: text("adapter_id").notNull(),
  identityKind: text("identity_kind").notNull(),
  externalKey: text("external_key").notNull(),
  canonicalUrl: text("canonical_url"),
  resolutionLayer: text("resolution_layer").notNull(),
  confidence: real("confidence"),
  assertionId: uuid("assertion_id").references(() => observation.id),
}, (t) => [unique("source_identity_key_unique").on(t.adapterId, t.identityKind, t.externalKey),
  index("source_identity_object_idx").on(t.objectId),
  check("source_identity_layer", sql`${t.resolutionLayer} in ('user','source','extracted','inferred')`),
  check("source_identity_confidence", sql`${t.confidence} between 0 and 1`),
  check("source_identity_nonempty", sql`length(trim(${t.adapterId})) > 0 and length(trim(${t.identityKind})) > 0 and length(trim(${t.externalKey})) > 0`)]);

export const objectAlias = pgTable("object_alias", {
  formerObjectId: uuid("former_object_id").primaryKey().references(() => objectRef.id),
  canonicalObjectId: uuid("canonical_object_id").notNull().references(() => objectRef.id),
  mergedAt: timestamptz("merged_at").notNull().defaultNow(),
  decisionObservationId: uuid("decision_observation_id").notNull().references(() => observation.id),
}, (t) => [index("object_alias_canonical_idx").on(t.canonicalObjectId),
  check("object_alias_not_self", sql`${t.formerObjectId} <> ${t.canonicalObjectId}`)]);

export const observationReview = pgTable("observation_review", {
  id: uuid("id").primaryKey().defaultRandom(),
  observationId: uuid("observation_id").notNull().references(() => observation.id),
  decision: text("decision").notNull(),
  reviewedAt: timestamptz("reviewed_at").notNull().defaultNow(),
  replacementObservationId: uuid("replacement_observation_id").references(() => observation.id),
  comment: text("comment"),
}, (t) => [index("observation_review_observation_idx").on(t.observationId, t.reviewedAt),
  check("observation_review_decision", sql`${t.decision} in ('confirmed','rejected','corrected')`),
  check("observation_review_replacement", sql`(${t.decision} = 'rejected' and ${t.replacementObservationId} is null) or (${t.decision} in ('confirmed','corrected') and ${t.replacementObservationId} is not null and ${t.replacementObservationId} <> ${t.observationId})`)]);
