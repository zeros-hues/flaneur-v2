// Semantic retrieval: cosine similarity against person profiles and against concepts.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { embed, toVectorLiteral } from "@/lib/enrich/gemini";

export const SEMANTIC_LIMIT = 10;

/**
 * Concepts are embedded for label-to-label similarity, where unrelated labels still score about
 * 0.75. Only concept matches above this floor count, so post topics that are merely present
 * don't outrank genuinely similar profiles.
 */
export const CONCEPT_MATCH_MIN = 0.85;

export interface Ranked {
  personId: string;
  score: number;
}

/**
 * Ranks people by the better of profile similarity and best matching-concept similarity,
 * deduplicated per person. `candidates` restricts the search (hybrid); null searches everyone.
 * Ordering by the similarity expression keeps the planner off the ivfflat indexes, whose recall
 * is poor on small tables: these are exact scans.
 */
export async function semanticSearch(text: string, candidates: string[] | null, limit = SEMANTIC_LIMIT): Promise<Ranked[]> {
  if (candidates && !candidates.length) return [];
  // Profiles were embedded as documents; concepts as labels. Each side gets its matching query type.
  const [[profileQuery], [conceptQuery]] = await Promise.all([
    embed([text], "RETRIEVAL_QUERY"),
    embed([text], "SEMANTIC_SIMILARITY"),
  ]);
  if (!profileQuery || !conceptQuery) throw new Error("query embedding failed");

  const only = (column: string) =>
    candidates ? sql`and ${sql.raw(column)} in (${sql.join(candidates.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``;

  const [profiles, concepts] = await Promise.all([
    db.execute<{ person_id: string; sim: number }>(sql`
      select p.id as person_id, 1 - (p.profile_embedding <=> ${toVectorLiteral(profileQuery)}::vector) as sim
      from person p where p.profile_embedding is not null ${only("p.id")}
      order by sim desc limit ${limit}`),
    db.execute<{ person_id: string; sim: number }>(sql`
      select a.person_id, max(1 - (c.embedding <=> ${toVectorLiteral(conceptQuery)}::vector)) as sim
      from concept c
      join concept_link l on l.concept_id = c.id
      join artifact a on a.id = l.artifact_id
      where c.embedding is not null and a.person_id is not null ${only("a.person_id")}
      group by a.person_id
      having max(1 - (c.embedding <=> ${toVectorLiteral(conceptQuery)}::vector)) > ${CONCEPT_MATCH_MIN}
      order by sim desc limit ${limit}`),
  ]);

  const best = new Map<string, number>();
  for (const row of [...profiles, ...concepts]) {
    const sim = Number(row.sim);
    if (sim > (best.get(row.person_id) ?? -Infinity)) best.set(row.person_id, sim);
  }
  return [...best]
    .map(([personId, score]) => ({ personId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
