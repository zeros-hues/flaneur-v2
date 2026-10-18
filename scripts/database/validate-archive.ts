import assert from "node:assert/strict";
import { databaseTimestamp } from "../../lib/database-timestamp";
import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fixtureConnection, type Connection } from "./fixture-connection";
import { markValidationStage } from "./validation-stage";
import { archiveObservation, type ArchiveStore } from "../../lib/review/archive";
import { postgresArchiveStore } from "../../lib/review/postgres-archive";
import { rejectObservation } from "../../lib/review/rejection";
import { postgresReviewStore } from "../../lib/review/postgres-rejection";
import { enqueueInTransaction } from "../../lib/processing/enqueue";
import { postgresJobs } from "../../lib/processing/postgres-jobs";
import type { Lease } from "../../lib/processing/worker";

export async function validateArchive(connection: Connection) {
  markValidationStage("observation_archive");
  const rollback = new Error("ARCHIVE_FIXTURE_ROLLBACK"); let checks = 0;
  try {
    await connection.begin("isolation level read committed", async (sql) => {
      await sql`set local statement_timeout = '20s'`;
      const person = randomUUID(), other = randomUUID(), snapshotId = randomUUID(), root = randomUUID();
      const child = randomUUID(), note = randomUUID(), relationship = randomUUID();
      for (const id of [person, other]) await sql`insert into public.person (id, profile_url, name)
        values (${id}, ${`https://www.linkedin.com/in/archive-fixture-${id}/`}, 'Archive fixture')`;
      await sql`insert into public.snapshot (id, capture_type, source_url, content_gzip, parser_version)
        values (${snapshotId}, 'profile', 'https://www.linkedin.com/in/archive-fixture/', ${gzipSync('Source text')}, 'validation')`;
      await sql`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text, support_status)
        values (${root}, ${person}, 'source', 'fact', 'Source text', 'verified'),
          (${child}, ${other}, 'inferred', 'summary', 'Dependent claim', 'partial'),
          (${note}, ${other}, 'user', 'note', 'Retained User words', 'verified')`;
      await sql`insert into public.observation_evidence (observation_id, snapshot_id, excerpt, support_role, evidence_version)
        values (${root}, ${snapshotId}, 'Source text', 'supports', 'validation')`;
      await sql`insert into public.observation_evidence (observation_id, supporting_observation_id, support_role, evidence_version)
        values (${child}, ${root}, 'supports', 'validation'), (${note}, ${root}, 'supports', 'validation')`;
      await sql`insert into public.relationship (id, from_object_id, to_object_id, predicate, state, origin_key)
        values (${relationship}, ${person}, ${other}, 'similar_trajectory', 'active', ${`fixture:${relationship}`})`;
      await sql`insert into public.relationship_support (relationship_id, observation_id) values (${relationship}, ${child})`;
      const jobId = await enqueueInTransaction(sql, { kind: 'enrich', snapshotId, targetId: person, fingerprint: 'a'.repeat(64) });
      const childJob = await enqueueInTransaction(sql, { kind: 'index', snapshotId, targetId: other, fingerprint: 'b'.repeat(64) });
      const lease: Lease = { jobId, snapshotId, kind: 'enrich', token: randomUUID(), inputFingerprint: 'a'.repeat(64), expiresAt: Date.now() + 120000 };
      await sql`update public.processing_job set state = 'leased', attempts = 1, lease_token = ${lease.token},
        leased_until = clock_timestamp() + interval '120 seconds' where id = ${jobId}`;
      await sql`insert into public.processing_run (job_id, lease_token, input_fingerprint, outcome)
        values (${jobId}, ${lease.token}, ${lease.inputFingerprint}, 'running')`;
      const target = fixtureConnection(sql), store = postgresArchiveStore(target);
      const request = { requestId: randomUUID(), observationId: root };
      const failing: ArchiveStore = { transaction(id, work) {
        return store.transaction(id, (tx) => work({ ...tx, async insertReceipt() { throw new Error('FIXTURE_RECEIPT_FAILURE'); } }));
      } };
      await assert.rejects(archiveObservation(request, failing), /FIXTURE_RECEIPT_FAILURE/); checks++;
      const [unchanged] = await sql`select (select archived_at from public.object_ref where id = ${root}) as archived,
        (select state from public.processing_job where id = ${jobId}) as job,
        (select state from public.relationship where id = ${relationship}) as relationship`;
      assert.equal(unchanged!.archived, null); assert.equal(unchanged!.job, 'leased'); assert.equal(unchanged!.relationship, 'active'); checks += 3;
      const archived = await archiveObservation(request, store), replay = await archiveObservation(request, store);
      assert.equal(archived.replayed, false); assert.equal(replay.replayed, true); assert.equal(replay.archivedAt, archived.archivedAt); checks += 3;
      const [timestamp] = await sql`select archived_at from public.object_ref where id = ${root}`;
      assert.equal(databaseTimestamp(timestamp!.archived_at).toISOString(), archived.archivedAt); checks++;
      const jobs = await sql`select state from public.processing_job where id in (${jobId}, ${childJob})`;
      assert.equal(jobs.length, 2); assert.ok(jobs.every((job) => job.state === 'superseded')); checks += 2;
      const [run] = await sql`select outcome from public.processing_run where lease_token = ${lease.token}`;
      assert.equal(run!.outcome, 'superseded'); checks++;
      let applied = false;
      const worker = postgresJobs(target, async () => { applied = true; });
      assert.equal(await worker.complete(lease, {}, 'succeeded', Date.now()), false); assert.equal(applied, false); checks += 2;
      const [retained] = await sql`select (select body_text from public.observation where id = ${root}) as text,
        (select truth_layer from public.observation where id = ${root}) as layer,
        (select count(*)::int from public.observation_evidence where observation_id = ${root}) as evidence,
        (select state from public.relationship where id = ${relationship}) as relationship`;
      assert.equal(retained!.text, 'Source text'); assert.equal(retained!.layer, 'source');
      assert.equal(retained!.evidence, 1); assert.equal(retained!.relationship, 'candidate'); checks += 4;
      const reviews = postgresReviewStore(target);
      await assert.rejects(rejectObservation({ requestId: randomUUID(), observationId: child }, reviews), /UNAVAILABLE/); checks++;
      await assert.rejects(rejectObservation({ requestId: randomUUID(), observationId: note }, reviews), /REQUIRES_REVISION/); checks++;
      const newJob = await enqueueInTransaction(sql, { kind: 'index', snapshotId, targetId: other, fingerprint: 'c'.repeat(64) });
      await archiveObservation(request, store);
      const [newer] = await sql`select state from public.processing_job where id = ${newJob}`;
      assert.equal(newer!.state, 'queued'); checks++;
      await assert.rejects(archiveObservation({ ...request, observationId: note }, store), /REQUEST_CONFLICT/); checks++;
      await assert.rejects(archiveObservation({ ...request, requestId: randomUUID() }, store), /UNAVAILABLE/); checks++;
      const explicit = await archiveObservation({ requestId: randomUUID(), observationId: note }, store);
      assert.equal(explicit.replayed, false); checks++;
      const [user] = await sql`select o.body_text, r.archived_at from public.observation o join public.object_ref r on r.id = o.id where o.id = ${note}`;
      assert.equal(user!.body_text, 'Retained User words'); assert.ok(user!.archived_at); checks += 2;
      await sql`set constraints all immediate`; throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  return checks;
}
