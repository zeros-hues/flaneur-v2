import { sql } from "drizzle-orm";
import { concept } from "@/db/schema";
import { db } from "@/lib/db";
import { DEDUPE_THRESHOLD, EMBEDDING_MODEL } from "./config";
import { toVectorLiteral } from "./gemini";

// Arbitrary constant: serialises concept creation so two concurrent enrichments
// cannot both miss each other's new concept and create near-duplicates.
const CONCEPT_LOCK = 72_210_431;

export interface ConceptLabel {
  label: string;
  embedding: number[];
  /** Prompt version that produced the label; stored only when a new concept is created. */
  promptVersion: string;
}

/**
 * Resolves a label to a concept id: links to the most similar existing concept when cosine
 * similarity is above the threshold, otherwise creates a new concept. One-directional: existing
 * concepts are never compared with or merged into each other.
 */
export async function resolveConcept(input: ConceptLabel): Promise<string> {
  const vec = toVectorLiteral(input.embedding);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${CONCEPT_LOCK})`);

    // Ordering by the similarity expression (not `embedding <=> x`) keeps the planner off the
    // ivfflat index, whose recall is poor on small tables: this is an exact scan of every concept.
    const [best] = await tx
      .select({ id: concept.id, sim: sql<number>`1 - (${concept.embedding} <=> ${vec}::vector)` })
      .from(concept)
      .where(sql`${concept.embedding} is not null`)
      .orderBy(sql`2 desc`)
      .limit(1);
    if (best && Number(best.sim) > DEDUPE_THRESHOLD) return best.id;

    const [created] = await tx
      .insert(concept)
      .values({
        label: input.label,
        kind: "concept",
        embedding: input.embedding,
        embeddingModel: EMBEDDING_MODEL,
        enrichmentPromptVersion: input.promptVersion,
      })
      .returning({ id: concept.id });
    if (!created) throw new Error(`failed to create concept "${input.label}"`);
    return created.id;
  });
}
