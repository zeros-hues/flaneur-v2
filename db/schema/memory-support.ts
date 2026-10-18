import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, text, unique, uuid } from "drizzle-orm/pg-core";
import { role } from "./people";
import { education, skill } from "./profile-details";
import { objectRef, observation } from "./memory";
import { timestamptz } from "./columns";

export const roleObservation = pgTable("role_observation", {
  roleId: uuid("role_id").notNull().references(() => role.id),
  observationId: uuid("observation_id").notNull().references(() => observation.id),
  fieldKey: text("field_key").notNull(),
}, (t) => [primaryKey({ columns: [t.roleId, t.observationId, t.fieldKey] }),
  index("role_observation_assertion_idx").on(t.observationId)]);
export const educationObservation = pgTable("education_observation", {
  educationId: uuid("education_id").notNull().references(() => education.id),
  observationId: uuid("observation_id").notNull().references(() => observation.id),
  fieldKey: text("field_key").notNull(),
}, (t) => [primaryKey({ columns: [t.educationId, t.observationId, t.fieldKey] }),
  index("education_observation_assertion_idx").on(t.observationId)]);
export const skillObservation = pgTable("skill_observation", {
  skillId: uuid("skill_id").notNull().references(() => skill.id),
  observationId: uuid("observation_id").notNull().references(() => observation.id),
  fieldKey: text("field_key").notNull(),
}, (t) => [primaryKey({ columns: [t.skillId, t.observationId, t.fieldKey] }),
  index("skill_observation_assertion_idx").on(t.observationId)]);

export const relationship = pgTable("relationship", {
  id: uuid("id").primaryKey(),
  fromObjectId: uuid("from_object_id").notNull().references(() => objectRef.id),
  toObjectId: uuid("to_object_id").notNull().references(() => objectRef.id),
  predicate: text("predicate").notNull(),
  state: text("state").notNull().default("candidate"),
  originKey: text("origin_key").notNull().unique(),
  validFrom: timestamptz("valid_from"),
  validTo: timestamptz("valid_to"),
}, (t) => [index("relationship_from_idx").on(t.fromObjectId, t.predicate),
  unique("relationship_endpoint_unique").on(t.fromObjectId, t.toObjectId, t.predicate),
  index("relationship_to_idx").on(t.toObjectId, t.predicate),
  check("relationship_state", sql`${t.state} in ('candidate','active','rejected')`),
  check("relationship_not_self", sql`${t.fromObjectId} <> ${t.toObjectId}`),
  check("relationship_dates", sql`${t.validFrom} is null or ${t.validTo} is null or ${t.validFrom} <= ${t.validTo}`),
  check("relationship_predicate", sql`${t.predicate} in ('authored_by','profile_of','mentions_concept','associated_with_concept','employed_by','educated_at','similar_trajectory','relevant_to')`)]);
export const relationshipSupport = pgTable("relationship_support", {
  relationshipId: uuid("relationship_id").notNull().references(() => relationship.id),
  observationId: uuid("observation_id").notNull().references(() => observation.id),
}, (t) => [primaryKey({ columns: [t.relationshipId, t.observationId] }),
  index("relationship_support_observation_idx").on(t.observationId)]);

// A receipt and its target rows commit together; changed input requires an explicit new version.
export const migrationReceipt = pgTable("migration_receipt", {
  key: text("key").primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  committedAt: timestamptz("committed_at").notNull().defaultNow(),
});
