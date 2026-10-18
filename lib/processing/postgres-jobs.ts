import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { databaseTimestamp } from "../database-timestamp";
import type { JobStore, Lease } from "./worker";

type SqlTransaction = postgres.TransactionSql;
// Provider/extraction work stays outside transactions; output application is injected and fenced.
export function postgresJobs<Result>(connection: ReturnType<typeof postgres>,
  apply: (sql: SqlTransaction, lease: Lease, result: Result) => Promise<void>,
  kinds: Lease["kind"][] = ["parse", "enrich", "index"]): JobStore<Result> {
  if (!kinds.length || kinds.some((kind) => !["parse", "enrich", "index"].includes(kind)))
    throw new Error("INVALID_PROCESSING_KINDS");
  return {
    async renew(lease, durationMs) {
      if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("INVALID_LEASE_DURATION");
      const rows = await connection`update processing_job j
        set leased_until = clock_timestamp() + ${durationMs} * interval '1 millisecond'
        from processing_head h where h.scope_key = j.scope_key and h.input_fingerprint = j.input_fingerprint
        and j.id = ${lease.jobId} and j.lease_token = ${lease.token} and j.input_fingerprint = ${lease.inputFingerprint}
        and j.state = 'leased' and j.leased_until > clock_timestamp() returning j.leased_until`;
      if (rows.length) lease.expiresAt = databaseTimestamp(rows[0]!.leased_until).getTime();
      return rows.length > 0;
    },
    async claim(_now, durationMs) {
      if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("INVALID_LEASE_DURATION");
      return connection.begin("isolation level read committed", async (sql) => {
        // Never leave exhausted jobs permanently leased after a worker disappears.
        // Lock jobs before their runs, matching reclaim/fail/invalidation. Skip other workers' rows.
        const exhausted = await sql`select id, lease_token from processing_job where state = 'leased'
          and kind = any(${kinds}) and leased_until <= clock_timestamp() and attempts >= max_attempts
          order by id for update skip locked`;
        if (exhausted.length) {
          const ids = exhausted.map((job) => job.id as string);
          const tokens = exhausted.map((job) => job.lease_token as string);
          await sql`update processing_run set outcome = 'failed', finished_at = now()
            where lease_token = any(${tokens}) and outcome = 'running'`;
          await sql`update processing_job set state = 'failed', lease_token = null, leased_until = null,
            last_error_code = 'LEASE_EXPIRED' where id = any(${ids})`;
        }
        const rows = await sql`select j.* from processing_job j join processing_head h on h.scope_key = j.scope_key
          and h.input_fingerprint = j.input_fingerprint
          where j.kind = any(${kinds}) and j.attempts < j.max_attempts and ((j.state = 'queued' and j.available_at <= now())
            or (j.state = 'leased' and j.leased_until <= clock_timestamp()))
          order by j.available_at, j.id limit 1 for update of j skip locked`;
        const row = rows[0]; if (!row) return null;
        if (row.lease_token) await sql`update processing_run set outcome = 'failed', finished_at = now()
          where lease_token = ${row.lease_token} and outcome = 'running'`;
        const token = randomUUID();
        const updated = await sql`update processing_job set state = 'leased', attempts = attempts + 1,
          lease_token = ${token}, leased_until = clock_timestamp() + ${durationMs} * interval '1 millisecond'
          where id = ${row.id} returning leased_until`;
        await sql`insert into processing_run (job_id, lease_token, input_fingerprint, outcome)
          values (${row.id}, ${token}, ${row.input_fingerprint}, 'running')`;
        return { jobId: row.id, token, snapshotId: row.snapshot_id, kind: row.kind,
          inputFingerprint: row.input_fingerprint, expiresAt: databaseTimestamp(updated[0]!.leased_until).getTime() } as Lease;
      });
    },
    async complete(lease, result, outcome, _now) {
      return connection.begin("isolation level read committed", async (sql) => {
        const scopes = await sql`select scope_key from processing_job where id = ${lease.jobId}`;
        if (!scopes.length) return false;
        await sql`select pg_advisory_xact_lock(hashtextextended(${`processing:${scopes[0]!.scope_key}`}, 0))`;
        const rows = await sql`select j.id from processing_job j join processing_head h on h.scope_key = j.scope_key
          and h.input_fingerprint = j.input_fingerprint where j.id = ${lease.jobId}
          and j.state = 'leased' and j.lease_token = ${lease.token} and j.input_fingerprint = ${lease.inputFingerprint}
          and j.leased_until > clock_timestamp() for update of j, h`;
        if (!rows.length) return false;
        await apply(sql, lease, result);
        const [valid] = await sql`select leased_until > clock_timestamp() as current from processing_job where id = ${lease.jobId}`;
        if (!valid?.current) throw new Error("LEASE_EXPIRED_DURING_APPLY");
        await sql`update processing_job set state = ${outcome}, lease_token = null, leased_until = null,
          last_error_code = null where id = ${lease.jobId}`;
        await sql`update processing_run set outcome = ${outcome}, finished_at = now() where lease_token = ${lease.token}`;
        return true;
      });
    },
    async fail(lease, code, _now) {
      const safeCode = /^[A-Z0-9_]{1,64}$/.test(code) ? code : "PROCESSING_FAILED";
      return connection.begin("isolation level read committed", async (sql) => {
        const rows = await sql`update processing_job set state = case when attempts >= max_attempts then 'failed' else 'queued' end,
        available_at = now() + least(3600, power(2, attempts)) * interval '1 second',
        lease_token = null, leased_until = null, last_error_code = ${safeCode}
        where id = ${lease.jobId} and state = 'leased' and lease_token = ${lease.token} and leased_until > clock_timestamp()
        returning id`;
        if (rows.length) await sql`update processing_run set outcome = 'failed', finished_at = now()
        where lease_token = ${lease.token} and outcome = 'running'`;
        return rows.length > 0;
      });
    },
  };
}
