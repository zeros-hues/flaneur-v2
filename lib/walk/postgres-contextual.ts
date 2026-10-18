import type postgres from "postgres";
import { readRetrievalTransaction } from "../retrieval/postgres-reader";
import type { ContextualCandidate } from "./contextual";

/** Actual query body exported for rollback-only validation. No inferred author joins. */
export async function contextualCandidatesTransaction(tx: postgres.TransactionSql): Promise<ContextualCandidate[]> {
  const { output } = await readRetrievalTransaction(tx, { mode: "resurface", objectKinds: ["person", "artifact"], terms: [], constraints: [] });
  const rows = await tx<{ id: string; kind: "person" | "artifact"; label: string; savedAt: string }[]>`
    select r.id,r.kind,case when r.kind='person' then p.name else coalesce(a.body_text,a.source_url) end as label,
      to_char(coalesce(p.first_captured_at,a.captured_at,r.created_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "savedAt"
    from public.object_ref r left join public.person p on p.id=r.id left join public.artifact a on a.id=r.id
    where r.kind in ('person','artifact') and r.archived_at is null
      and not exists(select 1 from public.object_alias x where x.former_object_id=r.id) order by r.id`;
  const byId = new Map(rows.map(row => [row.id, row]));
  return output.candidates.flatMap(candidate => {
    const row = byId.get(candidate.id); if (!row) return [];
    const times = (candidate.encounters ?? []).map(item => item.occurredAt).sort();
    return [{ ...row, label: Array.from(row.label ?? row.kind).slice(0, 180).join(""),
      lastEncounterAt: times.at(-1) ?? null, encounterCount: times.length, evidence: candidate.evidence }];
  });
}
export function postgresContextualCandidates(connection: ReturnType<typeof postgres>) {
  return async () => connection.begin("isolation level repeatable read read only", async tx => {
    await tx`set local statement_timeout = '15s'`;
    const [guard] = await tx`select current_setting('transaction_read_only') as read_only`;
    if (guard?.read_only !== "on") throw new Error("WALK_READER_NOT_READ_ONLY");
    return { candidates: await contextualCandidatesTransaction(tx) };
  });
}
