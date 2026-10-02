// The peripheral margin: concepts attached to the returned people and to the cited sources.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { MarginItem } from "./blocks";

/** The margin is a glimpse, not an index: it ends here. */
export const MARGIN_LIMIT = 8;

/**
 * Concepts on posts written by any of `personIds`, or linked to any of `artifactIds`: most shared
 * first, then by the rank of the person or source they came from (both lists are in result order).
 * Returns [] when there is nothing to look up.
 */
export async function marginConcepts(personIds: string[], artifactIds: string[]): Promise<MarginItem[]> {
  const people = [...new Set(personIds)];
  const artifacts = [...new Set(artifactIds)];
  if (!people.length && !artifacts.length) return [];

  const uuids = (ids: string[]) => sql`array[${sql.join(ids.length ? ids.map((id) => sql`${id}`) : [sql`null`], sql`, `)}]::uuid[]`;
  const p = uuids(people);
  const art = uuids(artifacts);
  // least() ignores nulls, so a concept ranks by whichever list it was reached through.
  const rows = await db.execute<{ id: string; label: string }>(sql`
    select c.id, c.label
    from concept_link cl
    join artifact a on a.id = cl.artifact_id
    join concept c on c.id = cl.concept_id
    where a.person_id = any(${p}) or a.id = any(${art})
    group by c.id, c.label
    order by count(distinct a.id) desc,
      min(least(array_position(${p}, a.person_id), array_position(${art}, a.id))) asc nulls last,
      c.label asc
    limit ${MARGIN_LIMIT}`);
  return rows.map((r) => ({ concept_id: r.id, label: r.label }));
}
