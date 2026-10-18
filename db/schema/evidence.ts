import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { snapshot } from "./artifacts";
import { observationEvidence } from "./memory";
import { timestamptz } from "./columns";

// Derived plaintext never replaces the original compressed snapshot. New normalizers add versions.
export const snapshotRepresentation = pgTable("snapshot_representation", {
  id: uuid("id").primaryKey(),
  snapshotId: uuid("snapshot_id").notNull().references(() => snapshot.id),
  normalizerVersion: text("normalizer_version").notNull(),
  text: text("text").notNull(),
  textHash: text("text_hash").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (t) => [unique("snapshot_representation_version_unique").on(t.snapshotId, t.normalizerVersion),
  check("snapshot_representation_hash", sql`${t.textHash} ~ '^[0-9a-f]{64}$'`),
  check("snapshot_representation_version", sql`length(trim(${t.normalizerVersion})) > 0`)]);

export const textEvidence = pgTable("text_evidence", {
  evidenceId: uuid("evidence_id").primaryKey().references(() => observationEvidence.id),
  representationId: uuid("representation_id").notNull().references(() => snapshotRepresentation.id),
  start: integer("start_codepoint").notNull(),
  end: integer("end_codepoint").notNull(),
  quote: text("quote").notNull(),
}, (t) => [index("text_evidence_representation_idx").on(t.representationId),
  check("text_evidence_range", sql`${t.start} >= 0 and ${t.end} > ${t.start}`),
  check("text_evidence_quote", sql`length(${t.quote}) > 0`)]);
