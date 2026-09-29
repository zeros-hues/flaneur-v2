import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { artifact, concept, conceptEdge, conceptLink } from "@/db/schema";
import { db } from "@/lib/db";
import type { Tx } from "@/lib/merge";
import { TOPIC_MIN_ARTIFACTS, TOPIC_MIN_CORPUS, TOPIC_SHARE } from "./config";

type Pair = readonly [string, string];

/** Canonical unordered pairs (a < b) of a set of concept ids. */
function pairs(ids: Set<string>): Map<string, Pair> {
  const sorted = [...ids].sort();
  const out = new Map<string, Pair>();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      out.set(`${a}|${b}`, [a, b]);
    }
  }
  return out;
}

/**
 * Updates co-occurrence edges for one artifact whose concept set changed from `before` to `after`.
 * Pairs that appear gain 1, pairs that disappear lose 1 (floored at 0), so re-enriching an
 * artifact never double-counts. Topics are excluded from edge updates entirely.
 */
export async function applyEdgeDiff(tx: Tx, before: Set<string>, after: Set<string>): Promise<void> {
  const all = [...new Set([...before, ...after])];
  if (all.length < 2) return;
  const topics = await tx
    .select({ id: concept.id })
    .from(concept)
    .where(and(inArray(concept.id, all), eq(concept.kind, "topic")));
  const topicIds = new Set(topics.map((t) => t.id));
  const keep = (s: Set<string>) => new Set([...s].filter((id) => !topicIds.has(id)));

  const oldPairs = pairs(keep(before));
  const newPairs = pairs(keep(after));

  for (const [key, [a, b]] of newPairs) {
    if (oldPairs.has(key)) continue;
    await tx
      .insert(conceptEdge)
      .values({ conceptAId: a, conceptBId: b, rawCount: 1, lastSeenAt: sql`now()` })
      .onConflictDoUpdate({
        target: [conceptEdge.conceptAId, conceptEdge.conceptBId],
        set: { rawCount: sql`${conceptEdge.rawCount} + 1`, lastSeenAt: sql`now()` },
      });
  }
  for (const [key, [a, b]] of oldPairs) {
    if (newPairs.has(key)) continue;
    await tx
      .update(conceptEdge)
      .set({ rawCount: sql`greatest(${conceptEdge.rawCount} - 1, 0)` })
      .where(and(eq(conceptEdge.conceptAId, a), eq(conceptEdge.conceptBId, b)));
  }
}

/**
 * Recounts document_frequency (distinct artifacts per concept), then promotes concepts that
 * appear on more than TOPIC_SHARE of all artifacts to topics. Promotion only happens once the
 * corpus has TOPIC_MIN_CORPUS artifacts and the concept is on at least TOPIC_MIN_ARTIFACTS.
 * Promotion is one-way: topics never revert. Returns the labels promoted by this call.
 */
export async function recountAndPromote(): Promise<string[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      update ${concept} c set document_frequency = coalesce(
        (select count(distinct l.artifact_id) from ${conceptLink} l where l.concept_id = c.id), 0)`);

    const [total] = await tx.select({ n: count() }).from(artifact);
    const artifacts = total?.n ?? 0;
    if (artifacts < TOPIC_MIN_CORPUS) return [];

    const promoted = await tx
      .update(concept)
      .set({ kind: "topic" })
      .where(
        and(
          eq(concept.kind, "concept"),
          gte(concept.documentFrequency, TOPIC_MIN_ARTIFACTS),
          sql`${concept.documentFrequency} > ${TOPIC_SHARE} * ${artifacts}`,
        ),
      )
      .returning({ label: concept.label });
    return promoted.map((p) => p.label);
  });
}
