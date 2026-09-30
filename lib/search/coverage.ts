// Coverage: how much of the network a search could see. Counts only; the UI words them.
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Coverage } from "./types";

const toNumber = (v: unknown) => Number(v ?? 0);

/** Coverage for a search that matched `matched` people. */
export async function coverage(matched: number): Promise<Coverage> {
  const [row] = await db.execute<{ searched_over: string; unenriched: string; incomplete: string }>(sql`
    select
      (select count(distinct r.person_id) from role r
        where r.is_primary and r.enrichment_prompt_version is not null) as searched_over,
      (select count(*) from person p where not exists (
        select 1 from role r where r.person_id = p.id and r.enrichment_prompt_version is not null)) as unenriched,
      (select count(distinct c.person_id) from section_coverage c
        where c.section = 'experience' and not c.is_complete) as incomplete`);
  return {
    matched,
    searched_over: toNumber(row?.searched_over),
    unenriched: toNumber(row?.unenriched),
    incomplete_timelines: toNumber(row?.incomplete),
  };
}

/** Number of people satisfying every condition (each a predicate over person `p`). */
export async function countPeople(conditions: SQL[]): Promise<number> {
  const where = conditions.length ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;
  const [row] = await db.execute<{ n: string }>(sql`select count(*) as n from person p ${where}`);
  return toNumber(row?.n);
}
