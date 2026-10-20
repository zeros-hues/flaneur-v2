import { captureKind } from "./parse-input";
import type postgres from "postgres";
import type { ExtractionSnapshot, ExtractionResult } from "./extraction";
import { extractionProcessor } from "./extraction";
import { applyExtraction } from "./apply-extraction";
import { postgresJobs } from "./postgres-jobs";

/** Shared actual query body for rollback-only processing fixtures. */
export async function readExtractionTransaction(sql:postgres.TransactionSql,snapshotId:string):Promise<ExtractionSnapshot> {
      const rows = await sql`select s.id, s.content_gzip, s.content_hash, s.source_url, s.adapter_id, s.capture_type
        from public.snapshot s where s.id = ${snapshotId}`;
      const row = rows[0];
      if (!row?.content_hash || !row.adapter_id) throw new Error("EXTRACTION_SNAPSHOT_UNAVAILABLE");
      const proof = await sql`select distinct o.id, o.subject_id from public.observation o
        join public.object_ref assertion_ref on assertion_ref.id = o.id
        join public.object_ref r on r.id = o.subject_id join public.encounter_object x on x.object_id = o.subject_id
        join public.encounter e on e.id = x.encounter_id
        where e.snapshot_id = ${snapshotId} and x.relation = 'noticed'
          and r.kind = 'person' and r.archived_at is null and assertion_ref.archived_at is null and o.support_status = 'verified'
          and o.truth_layer in ('user','source','extracted') and o.structured_value->>'identity_for_snapshot' = ${snapshotId}
          and not exists (select 1 from public.observation_review v where v.observation_id = o.id)
          and not exists (select 1 from public.observation n where n.supersedes_id = o.id)
          and not exists (select 1 from public.object_alias a where a.former_object_id = o.subject_id)`;
      const subject = proof.length === 1 ? { personId: proof[0]!.subject_id, identityObservationId: proof[0]!.id } : null;
      const snapshot: ExtractionSnapshot = { id: row.id, contentGzip: row.content_gzip, contentHash: row.content_hash,
        sourceUrl: row.source_url, adapterId: row.adapter_id, kind: captureKind(row.adapter_id, row.capture_type), subject };
      return snapshot;
}

/** Factory starts no worker. Used only by the explicitly invoked finite worker command. */
export function postgresExtraction(connection: ReturnType<typeof postgres>) {
  const store = postgresJobs<ExtractionResult>(connection, applyExtraction, ["parse"]);
  const process = extractionProcessor(async (snapshotId) => {
    const result = await connection.begin("isolation level repeatable read read only", async (sql) => {
      await sql`set local statement_timeout = '15s'`;
      const guard = await sql`select current_setting('transaction_read_only') as read_only`;
      if (guard[0]?.read_only !== "on") throw new Error("EXTRACTION_READER_NOT_READ_ONLY");
      return {snapshot:await readExtractionTransaction(sql,snapshotId)};
    });
    return result.snapshot;
  });
  return { store, process };
}
