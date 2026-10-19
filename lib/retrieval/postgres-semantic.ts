import type postgres from "postgres";
import { embed, toVectorLiteral } from "../enrich/gemini";
import type { SemanticCandidate, SemanticConceptMatch } from "./semantic-types";
import { SCORING_CONFIG } from "./scoring-config";

function extractDomain(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * Top-K semantic candidate generation in PostgreSQL using pgvector.
 * 
 * Rules:
 * - Query text is embedded using Gemini (RETRIEVAL_QUERY for artifacts/people, SEMANTIC_SIMILARITY for concepts).
 * - Queries are bounded to top-25 per entity type.
 * - Results are ephemeral candidates for Resurface ranking, NEVER graph facts or observations.
 * - If Gemini or pgvector is unavailable, fails gracefully returning [] so retrieval degrades safely.
 */
export async function generateSemanticCandidates(
  sql: postgres.TransactionSql,
  queryText: string,
): Promise<SemanticCandidate[]> {
  if (!queryText.trim()) return [];

  let queryVector: number[] | undefined;
  let conceptQueryVector: number[] | undefined;

  try {
    const [[qVec], [cVec]] = await Promise.all([
      embed([queryText], "RETRIEVAL_QUERY"),
      embed([queryText], "SEMANTIC_SIMILARITY"),
    ]);
    queryVector = qVec;
    conceptQueryVector = cVec;
  } catch {
    // If embedding generation fails (missing key, network offline, etc.), degrade safely to []
    return [];
  }

  if (!queryVector || !conceptQueryVector) return [];

  const qLiteral = sql`${toVectorLiteral(queryVector)}::vector`;
  const cLiteral = sql`${toVectorLiteral(conceptQueryVector)}::vector`;

  // 1. Artifact Candidates (top 25)
  const artifactRows = await sql<{
    id: string;
    personId: string | null;
    sourceUrl: string | null;
    similarity: number;
  }[]>`
    select a.id, a.person_id as "personId", a.source_url as "sourceUrl",
           1 - (a.item_embedding <=> ${qLiteral}) as similarity
    from public.artifact a
    join public.object_ref r on r.id = a.id and r.kind = 'artifact' and r.archived_at is null
    where a.item_embedding is not null
      and not exists (select 1 from public.object_alias alias where alias.former_object_id = a.id)
    order by a.item_embedding <=> ${qLiteral} asc
    limit 25
  `;

  // 2. Person Candidates (top 25)
  const personRows = await sql<{
    id: string;
    similarity: number;
  }[]>`
    select p.id,
           1 - (p.profile_embedding <=> ${qLiteral}) as similarity
    from public.person p
    join public.object_ref r on r.id = p.id and r.kind = 'person' and r.archived_at is null
    where p.profile_embedding is not null
      and not exists (select 1 from public.object_alias alias where alias.former_object_id = p.id)
    order by p.profile_embedding <=> ${qLiteral} asc
    limit 25
  `;

  // 3. Concept Candidates (top 25)
  const conceptRows = await sql<{
    id: string;
    label: string;
    similarity: number;
  }[]>`
    select c.id, c.label,
           1 - (c.embedding <=> ${cLiteral}) as similarity
    from public.concept c
    join public.object_ref r on r.id = c.id and r.kind = 'concept' and r.archived_at is null
    where c.embedding is not null
      and not exists (select 1 from public.object_alias alias where alias.former_object_id = c.id)
    order by c.embedding <=> ${cLiteral} asc
    limit 25
  `;

  const candidatesById = new Map<string, SemanticCandidate>();

  // Add Artifacts
  for (const row of artifactRows) {
    const sim = Number(row.similarity);
    candidatesById.set(row.id, {
      id: row.id,
      score: sim,
      kind: "artifact",
      source: "artifact_embedding",
      authorId: row.personId ?? undefined,
      sourceDomain: extractDomain(row.sourceUrl),
    });
  }

  // Add People
  for (const row of personRows) {
    const sim = Number(row.similarity);
    const existing = candidatesById.get(row.id);
    if (!existing || sim > existing.score) {
      candidatesById.set(row.id, {
        id: row.id,
        score: sim,
        kind: "person",
        source: "profile_embedding",
      });
    }
  }

  // Filter strong concepts (>= conceptMatchFloor)
  const strongConcepts = conceptRows.filter((c) => Number(c.similarity) >= SCORING_CONFIG.floors.conceptMatchFloor);
  if (strongConcepts.length > 0) {
    const conceptIds = strongConcepts.map((c) => c.id);
    const conceptMap = new Map(strongConcepts.map((c) => [c.id, { label: c.label, score: Number(c.similarity) }]));

    // Find linked artifacts
    const linkedArtifacts = await sql<{
      artifactId: string;
      conceptId: string;
    }[]>`
      select l.artifact_id as "artifactId", l.concept_id as "conceptId"
      from public.concept_link l
      join public.object_ref r on r.id = l.artifact_id and r.kind = 'artifact' and r.archived_at is null
      where l.concept_id = any(${conceptIds})
      limit 100
    `;

    for (const link of linkedArtifacts) {
      const c = conceptMap.get(link.conceptId);
      if (!c) continue;
      const conceptMatch: SemanticConceptMatch = { conceptId: link.conceptId, label: c.label, score: c.score };
      const existing = candidatesById.get(link.artifactId);
      if (existing) {
        existing.conceptMatches = [...(existing.conceptMatches ?? []), conceptMatch];
      } else {
        candidatesById.set(link.artifactId, {
          id: link.artifactId,
          score: c.score * 0.9, // Concept bridge has slight discount compared to direct match
          kind: "artifact",
          source: "concept_bridge",
          conceptMatches: [conceptMatch],
        });
      }
    }

    // Find people with reviewed concept association
    const associatedPeople = await sql<{
      personId: string;
      conceptId: string;
    }[]>`
      select r.from_object_id as "personId", r.to_object_id as "conceptId"
      from public.relationship r
      join public.object_ref p on p.id = r.from_object_id and p.kind = 'person' and p.archived_at is null
      where r.predicate = 'associated_with_concept' and r.state = 'active'
        and r.to_object_id = any(${conceptIds})
      limit 100
    `;

    for (const assoc of associatedPeople) {
      const c = conceptMap.get(assoc.conceptId);
      if (!c) continue;
      const conceptMatch: SemanticConceptMatch = { conceptId: assoc.conceptId, label: c.label, score: c.score };
      const existing = candidatesById.get(assoc.personId);
      if (existing) {
        existing.conceptMatches = [...(existing.conceptMatches ?? []), conceptMatch];
      } else {
        candidatesById.set(assoc.personId, {
          id: assoc.personId,
          score: c.score * 0.9,
          kind: "person",
          source: "concept_bridge",
          conceptMatches: [conceptMatch],
        });
      }
    }
  }

  return [...candidatesById.values()];
}
