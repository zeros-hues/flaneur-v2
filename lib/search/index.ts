// Query layer: route → retrieve → coverage, with typed empty states.
import { asc, inArray, sql, type SQL } from "drizzle-orm";
import { person } from "@/db/schema";
import { db } from "@/lib/db";
import { countPeople, coverage } from "./coverage";
import { routeQuery } from "./router";
import { SEMANTIC_LIMIT, semanticSearch } from "./semantic";
import { structuralPersonIds, structuralPopulation } from "./structural";
import type { RoutedQuery, SearchHit, SearchResult } from "./types";

/** Below this many people in a query's population, results would not mean anything. */
export const MIN_POPULATION = 3;
/** Structural results have no ranking; they are listed by name up to this many. */
export const STRUCTURAL_LIMIT = 50;

export type SearchInput = { query: string } | { routed: RoutedQuery | null };

const hasProfile: SQL = sql`p.profile_embedding is not null`;

/** The people this query can meaningfully search, as predicates over person `p`. */
function population(q: RoutedQuery): SQL[] {
  if (q.kind === "semantic") return [hasProfile];
  if (q.kind === "structural") return [structuralPopulation(q.filters)];
  return [hasProfile, structuralPopulation(q.filters)];
}

interface Scored {
  personId: string;
  score: number | null;
}

async function hits(ranked: Scored[]): Promise<SearchHit[]> {
  if (!ranked.length) return [];
  const rows = await db
    .select({
      id: person.id,
      name: person.name,
      headline: person.headline,
      profileUrl: person.profileUrl,
      synthesis: person.synthesis,
    })
    .from(person)
    .where(inArray(person.id, ranked.map((r) => r.personId)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ranked.flatMap(({ personId, score }) => {
    const p = byId.get(personId);
    return p
      ? [{ person_id: p.id, name: p.name, headline: p.headline, profile_url: p.profileUrl, synthesis: p.synthesis, score }]
      : [];
  });
}

async function retrieve(q: RoutedQuery): Promise<{ matched: number; results: SearchHit[] }> {
  if (q.kind === "semantic") {
    const ranked = await semanticSearch(q.semantic_text ?? "", null);
    return { matched: ranked.length, results: await hits(ranked) };
  }

  const ids = await structuralPersonIds(q.filters);
  if (q.kind === "structural") {
    const rows = ids.length
      ? await db.select({ id: person.id }).from(person).where(inArray(person.id, ids)).orderBy(asc(person.name)).limit(STRUCTURAL_LIMIT)
      : [];
    return { matched: ids.length, results: await hits(rows.map((r) => ({ personId: r.id, score: null }))) };
  }

  // Hybrid: structural filters give the candidate set; semantic similarity ranks within it.
  // Candidates without a profile embedding cannot be ranked and follow the ranked ones.
  const ranked = await semanticSearch(q.semantic_text ?? "", ids, ids.length);
  const seen = new Set(ranked.map((r) => r.personId));
  const unranked: Scored[] = ids.filter((id) => !seen.has(id)).map((personId) => ({ personId, score: null }));
  return { matched: ids.length, results: await hits([...ranked, ...unranked].slice(0, SEMANTIC_LIMIT)) };
}

export async function runSearch(input: SearchInput): Promise<SearchResult> {
  const routed = "routed" in input ? input.routed : await routeQuery(input.query);
  if (!routed) {
    return { interpretation: null, routed_json: null, results: [], coverage: await coverage(0), empty_reason: "parse_error" };
  }

  const base = { interpretation: routed.interpretation, routed_json: routed };
  if ((await countPeople(population(routed))) < MIN_POPULATION) {
    return { ...base, results: [], coverage: await coverage(0), empty_reason: "insufficient_data" };
  }

  const { matched, results } = await retrieve(routed);
  return { ...base, results, coverage: await coverage(matched), empty_reason: results.length ? null : "no_match" };
}
