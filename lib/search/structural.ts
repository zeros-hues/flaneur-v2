// Structural retrieval: SQL over classified role rows.
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Filters } from "./types";

/** Transition roles below this confidence are not trusted to define a domain. */
export const MIN_DOMAIN_CONFIDENCE = 0.6;

const list = (values: string[]) => sql.join(values.map((v) => sql`${v}`), sql`, `);

/**
 * domain_any, mode and active_before/after must all hold on the SAME role row.
 * domain_any additionally requires that row to be primary.
 */
function sameRoleCondition(f: Filters): SQL | null {
  const conds: SQL[] = [];
  if (f.domain_any) conds.push(sql`r.is_primary and r.domain in (${list(f.domain_any)})`);
  if (f.mode) conds.push(sql`r.mode::text in (${list(f.mode)})`);
  if (f.active_before) conds.push(sql`r.start_precision <> 'absent' and r.start_date < ${f.active_before}::date`);
  if (f.active_after) conds.push(sql`(r.is_current or r.end_date >= ${f.active_after}::date)`);
  if (!conds.length) return null;
  return sql`exists (select 1 from role r where r.person_id = p.id
    and r.enrichment_prompt_version is not null and ${sql.join(conds, sql` and `)})`;
}

/**
 * domain_from → domain_to: a trusted primary role in domain_from ends before a trusted primary
 * role in domain_to begins (ordered by start_date). A missing side matches any other domain.
 */
function transitionCondition(f: Filters): SQL | null {
  if (!f.domain_from && !f.domain_to) return null;
  const trusted = (alias: string) => sql.raw(`${alias}.is_primary and ${alias}.enrichment_prompt_version is not null
    and ${alias}.domain_confidence >= ${MIN_DOMAIN_CONFIDENCE} and ${alias}.start_precision <> 'absent'`);
  const from = f.domain_from ? sql`a.domain = ${f.domain_from}` : sql`a.domain <> b.domain`;
  const to = f.domain_to ? sql`b.domain = ${f.domain_to}` : sql`b.domain <> a.domain`;
  return sql`exists (select 1 from role a join role b on b.person_id = a.person_id
    where a.person_id = p.id and ${trusted("a")} and ${trusted("b")} and ${from} and ${to}
      and not a.is_current and a.start_date < b.start_date
      and (a.end_date is null or a.end_date <= b.start_date))`;
}

/** Every person id matching the structural filters (unranked, unlimited). */
export async function structuralPersonIds(f: Filters): Promise<string[]> {
  const conds = [sameRoleCondition(f), transitionCondition(f)].filter((c): c is SQL => c !== null);
  if (!conds.length) return [];
  const rows = await db.execute<{ id: string }>(sql`select p.id from person p where ${sql.join(conds, sql` and `)}`);
  return rows.map((r) => r.id);
}

/** Domains a structural query names; empty when it filters only on mode or dates. */
export const namedDomains = (f: Filters) =>
  [...new Set([...(f.domain_any ?? []), f.domain_from, f.domain_to].filter((d): d is string => !!d))];

/**
 * People a structural query can meaningfully search: those with an enriched primary role in
 * the named domains, or in any domain when none are named.
 */
export function structuralPopulation(f: Filters): SQL {
  const domains = namedDomains(f);
  const inDomains = domains.length ? sql`and r.domain in (${list(domains)})` : sql``;
  return sql`exists (select 1 from role r where r.person_id = p.id and r.is_primary
    and r.enrichment_prompt_version is not null ${inDomains})`;
}
