// Picks today's walk: due items, chosen by Maximal Marginal Relevance.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { snippet } from "@/lib/views/format";

export const WALK_SIZE = 3;
/** Weight of the diversity penalty against the most similar already-chosen person. */
const SIMILARITY_WEIGHT = 0.3;
/** Days overdue at which urgency reaches one half. */
const URGENCY_HALF_LIFE = 7;
/** Cards overdue by more than this many days are shown in the accent colour. */
const OVERDUE_ACCENT_DAYS = 7;
/** MMR runs over the most overdue candidates only. */
const CANDIDATES = 50;

export interface WalkItem {
  artifactId: string;
  type: "post" | "connection_request";
  status: string | null;
  personId: string | null;
  author: string;
  headline: string | null;
  /** Their LinkedIn profile; null for an organisation's post. */
  profileUrl: string | null;
  note: string | null;
  snippet: string | null;
  overdue: boolean;
}

interface Candidate {
  artifact_id: string;
  type: "post" | "connection_request";
  status: string | null;
  person_id: string | null;
  author: string | null;
  headline: string | null;
  profile_url: string | null;
  note: string | null;
  body_text: string | null;
  profile_embedding: string | null;
  days_overdue: number;
  [key: string]: unknown;
}

/**
 * Due: never surfaced (no schedule row, or last_surfaced_at null), or last_surfaced_at +
 * interval_days has passed. Overdue is measured from that due date; never-surfaced items
 * are overdue since capture.
 */
const dueCandidates = () =>
  db.execute<Candidate>(sql`
    with due as (
      select a.*, s.last_surfaced_at,
        case when s.last_surfaced_at is null then a.captured_at
             else s.last_surfaced_at + s.interval_days * interval '1 day' end as due_at
      from artifact a left join schedule s on s.artifact_id = a.id
    )
    select d.id as artifact_id, d.type, d.status, d.person_id, d.body_text,
      coalesce(p.name, o.display_name) as author, p.headline, p.profile_url, p.profile_embedding::text as profile_embedding,
      coalesce(
        (select n.body from note n where n.artifact_id = d.id order by n.created_at desc limit 1),
        (select n.body from note n where n.person_id = d.person_id order by n.created_at desc limit 1)
      ) as note,
      greatest(0, extract(epoch from now() - d.due_at) / 86400)::float8 as days_overdue
    from due d
    left join person p on p.id = d.person_id
    left join organisation o on o.id = d.organisation_id
    where d.due_at <= now()
    order by days_overdue desc
    limit ${CANDIDATES}`);

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) ** 2;
    nb += (b[i] ?? 0) ** 2;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const parseVector = (v: string | null): number[] | null => (v ? (JSON.parse(v) as number[]) : null);

export async function selectWalk(): Promise<WalkItem[]> {
  const pool = (await dueCandidates()).map((c) => ({ ...c, vector: parseVector(c.profile_embedding) }));
  const chosen: typeof pool = [];

  // Score = urgency − 0.3 × similarity to the closest already-chosen person; greedy top 3.
  while (chosen.length < WALK_SIZE && pool.length) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    pool.forEach((c, i) => {
      const days = Number(c.days_overdue);
      const urgency = days / (days + URGENCY_HALF_LIFE);
      const similarity = Math.max(0, ...chosen.map((s) => (c.vector && s.vector ? cosine(c.vector, s.vector) : 0)));
      const score = urgency - SIMILARITY_WEIGHT * similarity;
      if (score > bestScore) [bestIndex, bestScore] = [i, score];
    });
    chosen.push(...pool.splice(bestIndex, 1));
  }

  return chosen.map((c) => ({
    artifactId: c.artifact_id,
    type: c.type,
    status: c.status,
    personId: c.person_id,
    author: c.author ?? "Unknown",
    headline: c.headline,
    profileUrl: c.profile_url,
    note: c.note,
    snippet: c.type === "post" ? snippet(c.body_text, 200) : null,
    overdue: Number(c.days_overdue) > OVERDUE_ACCENT_DAYS,
  }));
}
