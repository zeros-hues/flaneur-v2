import { and, eq, isNull, ne, or, type SQL } from "drizzle-orm";
import { artifact, conceptLink } from "@/db/schema";
import { db } from "@/lib/db";
import { EMBEDDING_MODEL, PROMPT_VERSIONS } from "./config";
import { resolveConcept } from "./dedupe";
import { applyEdgeDiff } from "./edges";
import { embed } from "./gemini";
import { generateJson } from "./groq";
import { conceptPrompt, conceptResult, conceptSchema } from "./prompts";

// Embedding inputs are capped well under the model's token limit.
const MAX_EMBED_CHARS = 8000;

type Source = "hashtag" | "inferred";

interface Extracted {
  id: string;
  bodyText: string | null;
  labels: Map<string, Source>;
}

// LinkedIn renders hashtags as "hashtag#foo" in extracted text; drop both forms.
const stripHashtags = (text: string) =>
  text.replace(/(?:hashtag)?#[\p{L}\p{N}_]+/giu, " ").replace(/[ \t]+/g, " ").trim();

const normaliseLabel = (label: string) => label.trim().toLowerCase().replace(/\s+/g, " ");

async function extract(row: { id: string; bodyText: string | null; hashtags: string[] }): Promise<Extracted> {
  const labels = new Map<string, Source>();
  const text = row.bodyText ? stripHashtags(row.bodyText) : "";
  if (text.length > 0) {
    const result = await generateJson(conceptPrompt(text), conceptSchema, conceptResult);
    for (const c of result.concepts) labels.set(normaliseLabel(c), "inferred");
  }
  // Hashtags go through the same dedupe; an explicit hashtag outranks an inferred duplicate.
  for (const tag of row.hashtags) {
    const label = normaliseLabel(tag.replace(/^#/, ""));
    if (label) labels.set(label, "hashtag");
  }
  return { id: row.id, bodyText: row.bodyText, labels };
}

/** Replaces one artifact's concept links, updates edges by diff, and stores its embedding. */
async function writeArtifact(item: Extracted, conceptIds: Map<string, string>, bodyEmbedding: number[] | null) {
  const links = new Map<string, Source>();
  for (const [label, source] of item.labels) {
    const id = conceptIds.get(label);
    if (!id) continue;
    // Two labels can dedupe to one concept; hashtag wins the source.
    if (links.get(id) !== "hashtag") links.set(id, source);
  }

  await db.transaction(async (tx) => {
    // Row lock: concurrent enrichments of the same artifact apply their diffs one after another.
    await tx.select({ id: artifact.id }).from(artifact).where(eq(artifact.id, item.id)).for("update");
    const existing = await tx
      .select({ conceptId: conceptLink.conceptId })
      .from(conceptLink)
      .where(eq(conceptLink.artifactId, item.id));

    await tx.delete(conceptLink).where(eq(conceptLink.artifactId, item.id));
    if (links.size) {
      await tx
        .insert(conceptLink)
        .values([...links].map(([conceptId, source]) => ({ conceptId, artifactId: item.id, source })));
    }
    await applyEdgeDiff(tx, new Set(existing.map((e) => e.conceptId)), new Set(links.keys()));

    await tx
      .update(artifact)
      .set({
        itemEmbedding: bodyEmbedding,
        embeddingModel: bodyEmbedding ? EMBEDDING_MODEL : null,
        enrichmentPromptVersion: PROMPT_VERSIONS.concepts,
      })
      .where(eq(artifact.id, item.id));
  });
}

/**
 * Extracts, dedupes and links concepts for the matching artifacts, and embeds their bodies.
 * Model calls happen before any transaction; writes are short per-artifact transactions.
 */
export async function enrichArtifacts(scope: SQL, force: boolean): Promise<number> {
  const version = PROMPT_VERSIONS.concepts;
  const stale = or(isNull(artifact.enrichmentPromptVersion), ne(artifact.enrichmentPromptVersion, version));
  const rows = await db
    .select({ id: artifact.id, bodyText: artifact.bodyText, hashtags: artifact.hashtags })
    .from(artifact)
    .where(force ? scope : and(scope, stale));
  if (!rows.length) return 0;

  const items: Extracted[] = [];
  for (const row of rows) {
    try {
      items.push(await extract(row));
    } catch (error) {
      console.error(`[enrich] concept extraction for artifact ${row.id} failed`, error);
    }
  }

  // One batched embedding call for every distinct label, one for every body.
  const labels = [...new Set(items.flatMap((i) => [...i.labels.keys()]))];
  const labelVectors = await embed(labels, "SEMANTIC_SIMILARITY");
  const withBody = items.filter((i) => i.bodyText?.trim());
  const bodyVectors = await embed(
    withBody.map((i) => (i.bodyText ?? "").slice(0, MAX_EMBED_CHARS)),
    "RETRIEVAL_DOCUMENT",
  );
  const bodyById = new Map(withBody.map((i, n) => [i.id, bodyVectors[n] ?? null]));

  // Sequential: each new concept must be visible to the next label's dedupe.
  const conceptIds = new Map<string, string>();
  for (const [n, label] of labels.entries()) {
    const vector = labelVectors[n];
    if (!vector) continue;
    const hashtagOnly = items.every((i) => i.labels.get(label) !== "inferred");
    conceptIds.set(
      label,
      await resolveConcept({
        label,
        embedding: vector,
        promptVersion: hashtagOnly ? PROMPT_VERSIONS.hashtag : version,
      }),
    );
  }

  let done = 0;
  for (const item of items) {
    try {
      await writeArtifact(item, conceptIds, bodyById.get(item.id) ?? null);
      done++;
    } catch (error) {
      console.error(`[enrich] writing concepts for artifact ${item.id} failed`, error);
    }
  }
  return done;
}

export const artifactsOfPerson = (personId: string) => eq(artifact.personId, personId);
export const artifactById = (artifactId: string) => eq(artifact.id, artifactId);
