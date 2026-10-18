import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fixtureConnection, type Connection } from "./fixture-connection";
import { enqueueInTransaction } from "../../lib/processing/enqueue";
import { postgresJobs } from "../../lib/processing/postgres-jobs";
import { markValidationStage } from "./validation-stage";

/** Exercise actual claim/reclaim SQL only when no pre-existing queued/leased work can be selected. */
export async function validateWorker(connection: Connection) {
  markValidationStage("worker_queue_lock");
  const rollback = new Error("WORKER_FIXTURE_ROLLBACK");
  let checks = 0;
  try {
    await connection.begin("isolation level read committed", async (sql) => {
      await sql`set local statement_timeout = '20s'`;
      await sql`set local lock_timeout = '5s'`;
      // Block new job writes for this short fixture; a busy database fails instead of testing real jobs.
      await sql`lock table public.processing_job in share row exclusive mode`;
      const [existing] = await sql`select count(*)::int as count from public.processing_job where state in ('queued','leased')`;
      if (existing!.count) throw Object.assign(new Error("Fixture requires idle queue"), { code: "WORKER_VALIDATION_QUEUE_NOT_IDLE" });
      const snapshotId = randomUUID();
      await sql`insert into public.snapshot (id, capture_type, source_url, content_gzip, parser_version)
        values (${snapshotId}, 'profile', 'https://www.linkedin.com/in/sql-worker-fixture/', ${gzipSync('fixture')}, 'validation')`;
      const target = fixtureConnection(sql);
      const jobId = await enqueueInTransaction(sql, { kind: "parse", snapshotId, targetId: null, fingerprint: "a".repeat(64) });
      await sql`update public.processing_job set max_attempts = 3 where id = ${jobId}`;
      let applied = 0;
      const jobs = postgresJobs(target, async () => { applied++; }, ["parse"]);
      const first = await jobs.claim(Date.now(), 120000);
      markValidationStage("worker_initial_claim");
      assert.equal(first?.jobId, jobId); checks++;
      const [firstRun] = await sql`select outcome from public.processing_run where lease_token = ${first!.token}`;
      assert.equal(firstRun!.outcome, "running"); checks++;
      const foreign = { ...first!, token: randomUUID() };
      assert.equal(await jobs.renew(foreign, 120000), false); checks++;
      assert.equal(await jobs.complete(foreign, {}, "succeeded", Date.now()), false); checks++;
      assert.equal(applied, 0); checks++;
      assert.equal(await jobs.fail(first!, "unsafe error detail", Date.now()), true); checks++;
      markValidationStage("worker_failure_backoff");
      const [failed] = await sql`select state, last_error_code, lease_token from public.processing_job where id = ${jobId}`;
      assert.equal(failed!.state, "queued"); assert.equal(failed!.last_error_code, "PROCESSING_FAILED"); checks += 2;
      assert.equal(await jobs.claim(Date.now(), 120000), null); checks++;
      await sql`update public.processing_job set available_at = now() - interval '1 second' where id = ${jobId}`;
      const second = await jobs.claim(Date.now(), 120000);
      markValidationStage("worker_retry_claim");
      assert.equal(second?.jobId, jobId); assert.notEqual(second!.token, first!.token); checks += 2;
      await sql`update public.processing_job set leased_until = clock_timestamp() - interval '1 second' where id = ${jobId}`;
      const third = await jobs.claim(Date.now(), 120000);
      markValidationStage("worker_expired_reclaim");
      assert.equal(third?.jobId, jobId); assert.notEqual(third!.token, second!.token); checks += 2;
      const [expired] = await sql`select outcome from public.processing_run where lease_token = ${second!.token}`;
      assert.equal(expired!.outcome, "failed"); checks++;
      assert.equal(await jobs.renew(second!, 120000), false); checks++;
      await sql`update public.processing_job set leased_until = clock_timestamp() - interval '1 second' where id = ${jobId}`;
      assert.equal(await jobs.claim(Date.now(), 120000), null); checks++;
      markValidationStage("worker_retry_exhaustion");
      const [exhausted] = await sql`select state, last_error_code, lease_token from public.processing_job where id = ${jobId}`;
      assert.equal(exhausted!.state, "failed"); assert.equal(exhausted!.last_error_code, "LEASE_EXPIRED");
      assert.equal(exhausted!.lease_token, null); checks += 3;
      const [runs] = await sql`select count(*)::int as count from public.processing_run where job_id = ${jobId} and outcome = 'running'`;
      assert.equal(runs!.count, 0); checks++;
      const replacement = await enqueueInTransaction(sql, { kind: "parse", snapshotId, targetId: null, fingerprint: "b".repeat(64) });
      const fresh = await jobs.claim(Date.now(), 120000);
      markValidationStage("worker_replacement_input");
      assert.equal(fresh?.jobId, replacement); checks++;
      const expiring = postgresJobs(target, async (tx, lease) => {
        await tx`update public.processing_job set leased_until = clock_timestamp() - interval '1 second' where id = ${lease.jobId}`;
      }, ["parse"]);
      await assert.rejects(expiring.complete(fresh!, {}, "succeeded", Date.now()), /LEASE_EXPIRED_DURING_APPLY/); checks++;
      markValidationStage("worker_completion_rollback");
      // Savepoint rollback restored the pre-apply lease and run. Completion can still succeed.
      assert.equal(await jobs.renew(fresh!, 120000), true); checks++;
      assert.equal(await jobs.complete(fresh!, {}, "succeeded", Date.now()), true); checks++;
      assert.equal(applied, 1); checks++;
      const [completed] = await sql`select outcome from public.processing_run where lease_token = ${fresh!.token}`;
      assert.equal(completed!.outcome, "succeeded"); checks++;
      assert.equal(await jobs.claim(Date.now(), 120000), null); checks++;
      await sql`set constraints all immediate`;
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  return checks;
}
