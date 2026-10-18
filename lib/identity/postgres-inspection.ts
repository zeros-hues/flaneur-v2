import type postgres from "postgres";
import { z } from "zod";
import { identityInspection, type CapturedIdentity, type IdentityInspectionPage } from "./inspection";
import { capturedProfileTransaction } from "./captured-profile";

/** Actual query body for synthetic fixtures; application wrapper enforces read-only isolation. */
export async function inspectIdentitiesTransaction(sql: postgres.TransactionSql, personId: string, cursor?: string) {
  const id = z.uuid().parse(personId).toLowerCase(), after = cursor ? z.uuid().parse(cursor).toLowerCase() : null;
  const [person] = await sql`select archived_at is not null as archived from public.object_ref r where id = ${id} and kind = 'person'
    and not exists (select 1 from public.object_alias a where a.former_object_id = r.id)`;
  if (!person) return { page: null };
  const rows = await sql<Omit<CapturedIdentity,"noticedPeople" | "activeProofs" | "capturedEncounters">[]>`
    select s.id as "snapshotId",s.source_url as "sourceUrl",s.adapter_id as "adapterId",s.capture_type as "captureType",
      s.content_hash is not null as "hasContentHash",to_char(s.captured_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "capturedAt"
    from public.snapshot s where (${after}::uuid is null or s.id > ${after}::uuid) and (
      exists (select 1 from public.encounter e join public.encounter_object x on x.encounter_id = e.id
        where e.snapshot_id = s.id and x.object_id = ${id} and x.relation = 'noticed')
      or exists (select 1 from public.observation o where o.subject_id = ${id}
        and o.structured_value->>'identity_for_snapshot' = s.id::text)) order by s.id limit 21`;
  const selected = rows.slice(0,20), captures: IdentityInspectionPage["captures"] = [];
  for (const row of selected) {
    const capture=await capturedProfileTransaction(sql,row.snapshotId);
    if(capture)captures.push(identityInspection(capture,id,person.archived as boolean));
  }
  return { page: { personId: id,captures,nextCursor: rows.length > 20 ? selected.at(-1)!.snapshotId : null } as IdentityInspectionPage };
}
export function postgresIdentityInspectionReader(connection: ReturnType<typeof postgres>) {
  return async (personId: string,cursor?: string) => {
    const result = await connection.begin("isolation level repeatable read read only",async sql=>{
      await sql`set local statement_timeout = '15s'`;
      const [guard] = await sql`select current_setting('transaction_read_only') as mode`;
      if (guard!.mode !== 'on') throw new Error("IDENTITY_INSPECTION_NOT_READ_ONLY");
      return inspectIdentitiesTransaction(sql,personId,cursor);
    });
    return result.page;
  };
}
