import { randomUUID } from "node:crypto";
import type postgres from "postgres";
export { inputFingerprint } from "./fingerprint";

// Caller supplies a pool explicitly. No running worker or enqueue endpoint is enabled.
export interface ProcessingInput {
  kind: "parse" | "enrich" | "index"; snapshotId: string; targetId: string | null; fingerprint: string;
}
export async function enqueueProcessing(connection: ReturnType<typeof postgres>, input: ProcessingInput) {
  return connection.begin("isolation level read committed", (sql) => enqueueInTransaction(sql, input));
}

/** Caller owns commit/rollback, including related identity or input changes. */
export async function enqueueInTransaction(sql: postgres.TransactionSql, input: ProcessingInput) {
  if (input.kind !== "parse" && !input.targetId) throw new Error("PROCESSING_TARGET_REQUIRED");
  if (!/^[0-9a-f]{64}$/.test(input.fingerprint)) throw new Error("INVALID_INPUT_FINGERPRINT");
  const scope = input.kind === "parse" ? `parse:snapshot:${input.snapshotId}` : `${input.kind}:object:${input.targetId}`;
    await sql`select pg_advisory_xact_lock(hashtextextended(${`processing:${scope}`}, 0))`;
    await sql`insert into processing_head (scope_key, input_fingerprint) values (${scope}, ${input.fingerprint})
      on conflict (scope_key) do update set input_fingerprint = excluded.input_fingerprint, updated_at = now()`;
    // Claim/reclaim/fail lock jobs before runs. Preserve that order during invalidation too.
    await sql`select id from processing_job where scope_key = ${scope} and input_fingerprint <> ${input.fingerprint}
      and state in ('queued','leased') order by id for update`;
    await sql`update processing_run r set outcome = 'superseded', finished_at = now()
      from processing_job j where r.lease_token = j.lease_token and r.outcome = 'running'
      and j.scope_key = ${scope} and j.input_fingerprint <> ${input.fingerprint} and j.state in ('queued','leased')`;
    await sql`update processing_job set state = 'superseded', lease_token = null, leased_until = null
      where scope_key = ${scope} and input_fingerprint <> ${input.fingerprint} and state in ('queued','leased')`;
    await sql`insert into processing_job (id, snapshot_id, target_id, kind, scope_key, input_fingerprint)
      values (${randomUUID()}, ${input.snapshotId}, ${input.targetId}, ${input.kind}, ${scope}, ${input.fingerprint})
      on conflict (scope_key, input_fingerprint) do nothing`;
    const rows = await sql`select id from processing_job where scope_key = ${scope} and input_fingerprint = ${input.fingerprint}`;
    return rows[0]!.id as string;
}
