// Step 1: retrieves the posts and person syntheses most similar to a question.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { embed, toVectorLiteral } from "@/lib/enrich/gemini";

export const ASK_LIMIT = 12;
/** Documents below this cosine similarity to the question are not retrieved. Calibrated on live data. */
export const ASK_MIN_SIMILARITY = 0.6;

export interface Retrieved {
  kind: "post" | "synthesis";
  artifactId: string | null;
  personId: string;
  personName: string;
  text: string;
  capturedAt: Date;
  similarity: number;
}

interface Row {
  kind: "post" | "synthesis";
  artifact_id: string | null;
  person_id: string;
  person_name: string;
  text: string;
  captured_at: string | Date;
  similarity: number;
  [key: string]: unknown;
}

/**
 * Both sources were embedded as RETRIEVAL_DOCUMENT, so their similarities share a scale and
 * can be ranked together. Only person-authored posts are searched. Ordering by the similarity
 * expression keeps the planner off the ivfflat indexes (poor recall on small tables).
 */
export async function retrieve(question: string, minSimilarity = ASK_MIN_SIMILARITY): Promise<Retrieved[]> {
  const [vector] = await embed([question], "RETRIEVAL_QUERY");
  if (!vector) throw new Error("question embedding failed");
  const q = sql`${toVectorLiteral(vector)}::vector`;

  const rows = await db.execute<Row>(sql`
    select * from (
      select 'post' as kind, a.id as artifact_id, p.id as person_id, p.name as person_name,
        a.body_text as text, a.captured_at, 1 - (a.item_embedding <=> ${q}) as similarity
      from artifact a join person p on p.id = a.person_id
      where a.item_embedding is not null and a.body_text is not null
      union all
      select 'synthesis', null, p.id, p.name, p.synthesis,
        coalesce(p.last_profile_sync_at, p.first_captured_at), 1 - (p.profile_embedding <=> ${q})
      from person p
      where p.profile_embedding is not null and p.synthesis is not null
    ) docs
    where similarity >= ${minSimilarity}
    order by similarity desc
    limit ${ASK_LIMIT}`);

  return rows.map((r) => ({
    kind: r.kind,
    artifactId: r.artifact_id,
    personId: r.person_id,
    personName: r.person_name,
    text: r.text,
    capturedAt: new Date(r.captured_at),
    similarity: Number(r.similarity),
  }));
}

/** Total posts and people: the size of the city a question is asked of. */
export async function corpusSize(): Promise<number> {
  const [row] = await db.execute<{ n: string }>(
    sql`select (select count(*) from artifact) + (select count(*) from person) as n`,
  );
  return Number(row?.n ?? 0);
}
