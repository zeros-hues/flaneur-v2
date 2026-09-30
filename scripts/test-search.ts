// Runs three plain-language searches against the live database and prints what came back.
// Queries are chosen from the data so each exercises its intended path:
//   semantic, structural (a domain transition if enough people exist, otherwise domain_any),
//   and one expected to hit insufficient_data (a transition too few people could match).
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { runSearch, MIN_POPULATION } from "@/lib/search";
import { MIN_DOMAIN_CONFIDENCE } from "@/lib/search/structural";

const READABLE: Record<string, string> = { ml: "machine learning", "ui-ux": "UI/UX design", web: "web development" };
const readable = (domain: string) => READABLE[domain] ?? domain.replace(/^other:/, "").replace(/-/g, " ");

type Transition = {
  domain_from: string;
  domain_to: string;
  population: number;
};

async function transitions(): Promise<Transition[]> {
  return db.execute<Transition>(sql`
    with t as (
      select distinct a.domain as domain_from, b.domain as domain_to
      from role a join role b on b.person_id = a.person_id
      where a.is_primary and b.is_primary and a.domain <> b.domain
        and a.domain_confidence >= ${MIN_DOMAIN_CONFIDENCE} and b.domain_confidence >= ${MIN_DOMAIN_CONFIDENCE}
        and a.start_precision <> 'absent' and b.start_precision <> 'absent'
        and not a.is_current and a.start_date < b.start_date
        and (a.end_date is null or a.end_date <= b.start_date))
    select t.domain_from, t.domain_to,
      (select count(distinct r.person_id)::int from role r where r.is_primary
        and r.enrichment_prompt_version is not null and r.domain in (t.domain_from, t.domain_to)) as population
    from t order by population desc, t.domain_from, t.domain_to`);
}

/** The fewest most-common primary domains that together cover MIN_POPULATION people. */
async function commonDomains(): Promise<string[]> {
  const rows = await db.execute<{ domain: string; person_id: string }>(sql`
    select distinct domain, person_id from role
    where is_primary and enrichment_prompt_version is not null and domain is not null`);
  const people = new Map<string, Set<string>>();
  for (const r of rows) people.set(r.domain, (people.get(r.domain) ?? new Set()).add(r.person_id));
  const ordered = [...people].sort((a, b) => b[1].size - a[1].size);
  const covered = new Set<string>();
  const chosen: string[] = [];
  for (const [domain, ids] of ordered) {
    if (covered.size >= MIN_POPULATION) break;
    chosen.push(domain);
    ids.forEach((id) => covered.add(id));
  }
  return chosen;
}

async function show(label: string, query: string): Promise<void> {
  const result = await runSearch({ query });
  console.log(`\n=== ${label}: "${query}"`);
  console.log(`interpretation: ${result.interpretation ?? "(none)"}`);
  console.log(`routed: ${JSON.stringify(result.routed_json && { kind: result.routed_json.kind, semantic_text: result.routed_json.semantic_text, filters: result.routed_json.filters })}`);
  console.log(`coverage: ${JSON.stringify(result.coverage)}`);
  console.log(`empty_reason: ${result.empty_reason ?? "null"}`);
  for (const hit of result.results.slice(0, 3)) {
    console.log(`  - ${hit.name}${hit.score === null ? "" : ` (${hit.score.toFixed(3)})`}: ${hit.headline ?? ""}`);
  }
}

async function main(): Promise<void> {
  await show("semantic", "people who think about how users experience digital products");

  const all = await transitions();
  const big = all.find((t) => t.population >= MIN_POPULATION);
  if (big) {
    await show("structural (transition)", `people who moved from ${readable(big.domain_from)} into ${readable(big.domain_to)}`);
  } else {
    const domains = await commonDomains();
    console.log(`\n(no transition has ${MIN_POPULATION}+ people in its domains; using domain_any instead)`);
    await show("structural (domain_any)", `people who have worked in ${domains.map(readable).join(" or ")}`);
  }

  const small = [...all].reverse().find((t) => t.population < MIN_POPULATION);
  await show(
    "insufficient_data",
    small
      ? `people who moved from ${readable(small.domain_from)} into ${readable(small.domain_to)}`
      : "clinicians who moved into hardware engineering",
  );
}

try {
  await main();
} finally {
  await db.$client.end();
}
