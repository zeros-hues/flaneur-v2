// Pairs for the idle surface: two things from the city with a real line between them.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const PAIR_LIMIT = 12;

export interface PairItem {
  kind: "person" | "idea";
  id: string;
  label: string;
}

export interface CityPair {
  kind: "person-person" | "person-idea" | "idea-idea";
  a: PairItem;
  b: PairItem;
}

interface Row {
  a_id: string;
  a_label: string;
  b_id: string;
  b_label: string;
  [key: string]: unknown;
}

const person = (id: string, label: string): PairItem => ({ kind: "person", id, label });
const idea = (id: string, label: string): PairItem => ({ kind: "idea", id, label });

/** Two people who share a concept through their posts; most shared first. */
const personPerson = () =>
  db.execute<Row>(sql`
    select p1.id a_id, p1.name a_label, p2.id b_id, p2.name b_label
    from concept_link l1
    join artifact a1 on a1.id = l1.artifact_id
    join concept_link l2 on l2.concept_id = l1.concept_id
    join artifact a2 on a2.id = l2.artifact_id
    join person p1 on p1.id = a1.person_id
    join person p2 on p2.id = a2.person_id
    where p1.id < p2.id
    group by p1.id, p1.name, p2.id, p2.name
    order by count(distinct l1.concept_id) desc, random()
    limit ${PAIR_LIMIT}`);

/** A person and a concept on one of their posts; one concept per person, so the people vary. */
const personIdea = () =>
  db.execute<Row>(sql`
    select * from (
      select distinct on (p.id) p.id a_id, p.name a_label, c.id b_id, c.label b_label
      from concept_link l
      join artifact a on a.id = l.artifact_id
      join person p on p.id = a.person_id
      join concept c on c.id = l.concept_id
      order by p.id, random()
    ) one_each
    order by random()
    limit ${PAIR_LIMIT}`);

/** The strongest co-occurring concepts; topics are excluded. */
const ideaIdea = () =>
  db.execute<Row>(sql`
    select ca.id a_id, ca.label a_label, cb.id b_id, cb.label b_label
    from concept_edge e
    join concept ca on ca.id = e.concept_a_id
    join concept cb on cb.id = e.concept_b_id
    where e.raw_count > 0 and ca.kind = 'concept' and cb.kind = 'concept'
    order by e.raw_count desc, random()
    limit ${PAIR_LIMIT}`);

/** Up to PAIR_LIMIT pairs, interleaving the three kinds. Empty when the city has fewer than 2 people. */
export async function cityPairs(): Promise<CityPair[]> {
  const [count] = await db.execute<{ n: string }>(sql`select count(*) n from person`);
  if (Number(count?.n ?? 0) < 2) return [];

  const [pp, pi, ii] = await Promise.all([personPerson(), personIdea(), ideaIdea()]);
  const lists: CityPair[][] = [
    pp.map((r) => ({ kind: "person-person", a: person(r.a_id, r.a_label), b: person(r.b_id, r.b_label) })),
    pi.map((r) => ({ kind: "person-idea", a: person(r.a_id, r.a_label), b: idea(r.b_id, r.b_label) })),
    ii.map((r) => ({ kind: "idea-idea", a: idea(r.a_id, r.a_label), b: idea(r.b_id, r.b_label) })),
  ];
  const pairs: CityPair[] = [];
  for (let i = 0; pairs.length < PAIR_LIMIT && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const pair = list[i];
      if (pair && pairs.length < PAIR_LIMIT) pairs.push(pair);
    }
  }
  return pairs;
}
