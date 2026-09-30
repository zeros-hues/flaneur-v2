import { eq } from "drizzle-orm";
import { savedQuery } from "@/db/schema";
import { db } from "@/lib/db";
import { runSearch } from "./index";
import { normaliseRouted, routedQuery, type RoutedQuery, type SearchResult } from "./types";

export async function saveQuery(text: string, routed: RoutedQuery): Promise<string> {
  const [row] = await db.insert(savedQuery).values({ text, routedJson: routed }).returning({ id: savedQuery.id });
  if (!row) throw new Error("failed to save query");
  return row.id;
}

const sameSet = (a: string[], b: string[]) => {
  const set = new Set(a);
  return set.size === new Set(b).size && b.every((id) => set.has(id));
};

/**
 * Re-runs a saved query from its stored routed_json (no re-routing) and records the result.
 * new_results is true when the set of people differs from the previous run; order changes
 * alone don't count. Returns null when the saved query does not exist.
 */
export async function runSavedQuery(id: string): Promise<(SearchResult & { new_results: boolean }) | null> {
  const [saved] = await db.select().from(savedQuery).where(eq(savedQuery.id, id));
  if (!saved) return null;

  const parsed = routedQuery.safeParse(saved.routedJson);
  const result = await runSearch({ routed: parsed.success ? normaliseRouted(parsed.data) : null });

  const personIds = result.results.map((r) => r.person_id);
  const newResults = !sameSet(saved.lastResultPersonIds ?? [], personIds);
  await db
    .update(savedQuery)
    .set({ lastRunAt: new Date(), lastResultPersonIds: personIds })
    .where(eq(savedQuery.id, id));
  return { ...result, new_results: newResults };
}
