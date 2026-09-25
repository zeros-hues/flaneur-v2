import { index, integer, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { artifact } from "./artifacts";
import { embedding, ivfflatCosine, timestamptz } from "./columns";
import { conceptKind, conceptLinkSource } from "./enums";

export const concept = pgTable(
  "concept",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    kind: conceptKind("kind").notNull(),
    embedding: embedding("embedding"),
    documentFrequency: integer("document_frequency").notNull().default(0),
    firstSeenAt: timestamptz("first_seen_at").notNull().defaultNow(),
  },
  (t) => [ivfflatCosine("concept_embedding_idx", t.embedding)],
);

// concept_id leads the PK, so only artifact_id needs its own index.
export const conceptLink = pgTable(
  "concept_link",
  {
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concept.id, { onDelete: "cascade" }),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifact.id, { onDelete: "cascade" }),
    source: conceptLinkSource("source").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.conceptId, t.artifactId] }),
    index("concept_link_artifact_id_idx").on(t.artifactId),
  ],
);

// concept_a_id leads the PK, so only concept_b_id needs its own index.
export const conceptEdge = pgTable(
  "concept_edge",
  {
    conceptAId: uuid("concept_a_id")
      .notNull()
      .references(() => concept.id, { onDelete: "cascade" }),
    conceptBId: uuid("concept_b_id")
      .notNull()
      .references(() => concept.id, { onDelete: "cascade" }),
    rawCount: integer("raw_count").notNull().default(0),
    lastSeenAt: timestamptz("last_seen_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conceptAId, t.conceptBId] }),
    index("concept_edge_concept_b_id_idx").on(t.conceptBId),
  ],
);
