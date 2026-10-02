// Server-side data for /city: everyone, placed by what they share.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { fieldHeight, FIELD_WIDTH, layout } from "./layout";

/** complete: a full profile (rings); partial: a profile with gaps; stub: captured from a post only. */
export type PersonState = "complete" | "partial" | "stub";

export interface CityNode {
  id: string;
  name: string;
  headline: string | null;
  domain: string | null;
  state: PersonState;
  x: number;
  y: number;
}

export interface CityNetwork {
  nodes: CityNode[];
  /** Index pairs into nodes: people who share a concept. */
  lines: [number, number][];
  width: number;
  height: number;
}

interface Row {
  id: string;
  name: string;
  headline: string | null;
  roles: number;
  schools: number;
  experience_complete: boolean | null;
  domain: string | null;
  concepts: string[] | null;
  [key: string]: unknown;
}

export async function loadNetwork(): Promise<CityNetwork> {
  const rows = await db.execute<Row>(sql`
    select p.id, p.name, p.headline,
      (select count(*)::int from role r where r.person_id = p.id) as roles,
      (select count(*)::int from education e where e.person_id = p.id) as schools,
      (select c.is_complete from section_coverage c where c.person_id = p.id and c.section = 'experience') as experience_complete,
      (select r.domain from role r where r.person_id = p.id and r.is_primary
        order by r.is_current desc, r.start_date desc nulls last limit 1) as domain,
      (select array_agg(distinct cl.concept_id::text) from concept_link cl
        join artifact a on a.id = cl.artifact_id where a.person_id = p.id) as concepts
    from person p
    order by p.id`);

  const concepts = rows.map((r) => new Set(r.concepts ?? []));
  const shared = (i: number, j: number) => {
    let n = 0;
    for (const c of concepts[i] ?? []) if (concepts[j]?.has(c)) n++;
    return n;
  };
  const placed = layout(rows.length, shared);

  const nodes: CityNode[] = rows.map((r, i) => ({
    id: r.id,
    name: r.name,
    headline: r.headline,
    domain: r.domain,
    state: r.roles === 0 && r.schools === 0 ? "stub" : r.roles > 0 && r.experience_complete ? "complete" : "partial",
    x: placed[i]?.x ?? 0,
    y: placed[i]?.y ?? 0,
  }));

  return { nodes, lines: conceptRings(nodes, concepts), width: FIELD_WIDTH, height: fieldHeight(nodes.length) };
}

/**
 * For each concept, its members joined in a loose ring around their centre (ordered by angle),
 * rather than every pair: the same people connected, with far fewer crossing lines.
 */
function conceptRings(nodes: CityNode[], concepts: Set<string>[]): [number, number][] {
  const members = new Map<string, number[]>();
  concepts.forEach((set, i) => set.forEach((c) => members.set(c, [...(members.get(c) ?? []), i])));

  const seen = new Set<string>();
  const lines: [number, number][] = [];
  for (const group of members.values()) {
    if (group.length < 2) continue;
    const cx = group.reduce((s, i) => s + (nodes[i]?.x ?? 0), 0) / group.length;
    const cy = group.reduce((s, i) => s + (nodes[i]?.y ?? 0), 0) / group.length;
    const ring = [...group].sort(
      (a, b) =>
        Math.atan2((nodes[a]?.y ?? 0) - cy, (nodes[a]?.x ?? 0) - cx) - Math.atan2((nodes[b]?.y ?? 0) - cy, (nodes[b]?.x ?? 0) - cx),
    );
    const segments = ring.length === 2 ? 1 : ring.length;
    for (let s = 0; s < segments; s++) {
      const a = ring[s] as number;
      const b = ring[(s + 1) % ring.length] as number;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(a < b ? [a, b] : [b, a]);
    }
  }
  return lines;
}
