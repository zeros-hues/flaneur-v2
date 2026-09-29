import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, real, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { bytea, embedding, ivfflatCosine, timestamptz } from "./columns";
import { artifactStatus, artifactType, captureType, scheduleAction } from "./enums";
import { organisation, person } from "./people";

export const artifact = pgTable(
  "artifact",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Exactly one author: a person, or an organisation (company and showcase pages post too).
    personId: uuid("person_id").references(() => person.id, { onDelete: "cascade" }),
    organisationId: uuid("organisation_id").references(() => organisation.id, {
      onDelete: "cascade",
    }),
    type: artifactType("type").notNull(),
    sourceUrl: text("source_url").notNull(),
    urn: text("urn"),
    postType: text("post_type"),
    bodyText: text("body_text"),
    hashtags: text("hashtags").array().notNull().default([]),
    authorHeadlineSnapshot: text("author_headline_snapshot"),
    reactionCount: integer("reaction_count"),
    commentCount: integer("comment_count"),
    status: artifactStatus("status"),
    capturedAt: timestamptz("captured_at").notNull().defaultNow(),
    itemEmbedding: embedding("item_embedding"),
    embeddingModel: text("embedding_model"),
    enrichmentPromptVersion: text("enrichment_prompt_version"),
  },
  (t) => [
    index("artifact_person_id_idx").on(t.personId),
    index("artifact_organisation_id_idx").on(t.organisationId),
    uniqueIndex("artifact_urn_idx").on(t.urn),
    check("artifact_one_author", sql`num_nonnulls(${t.personId}, ${t.organisationId}) = 1`),
    ivfflatCosine("artifact_item_embedding_idx", t.itemEmbedding),
  ],
);

export const note = pgTable(
  "note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id").references(() => person.id, { onDelete: "set null" }),
    artifactId: uuid("artifact_id").references(() => artifact.id, { onDelete: "set null" }),
    // The capture this note was written alongside; person/artifact are linked once parsed.
    snapshotId: uuid("snapshot_id").references(() => snapshot.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("note_person_id_idx").on(t.personId),
    index("note_artifact_id_idx").on(t.artifactId),
    index("note_snapshot_id_idx").on(t.snapshotId),
  ],
);

export const snapshot = pgTable(
  "snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id").references(() => person.id, { onDelete: "set null" }),
    artifactId: uuid("artifact_id").references(() => artifact.id, { onDelete: "set null" }),
    captureType: captureType("capture_type").notNull(),
    sourceUrl: text("source_url").notNull(),
    sectionsCovered: text("sections_covered").array().notNull().default([]),
    contentGzip: bytea("content_gzip").notNull(),
    parserVersion: text("parser_version").notNull(),
    capturedAt: timestamptz("captured_at").notNull().defaultNow(),
  },
  (t) => [
    index("snapshot_person_id_idx").on(t.personId),
    index("snapshot_artifact_id_idx").on(t.artifactId),
  ],
);

// Spaced-repetition state, one row per artifact. The PK doubles as the FK index.
export const schedule = pgTable("schedule", {
  artifactId: uuid("artifact_id")
    .primaryKey()
    .references(() => artifact.id, { onDelete: "cascade" }),
  ease: real("ease").notNull().default(2.5),
  intervalDays: real("interval_days").notNull().default(1),
  lastSurfacedAt: timestamptz("last_surfaced_at"),
  lastAction: scheduleAction("last_action"),
});
