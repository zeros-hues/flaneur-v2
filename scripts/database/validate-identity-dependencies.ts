import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fixtureConnection, type Connection } from "./fixture-connection";
import { markValidationStage } from "./validation-stage";
import { confirmProfileIdentity, type IdentityStore } from "../../lib/identity/confirmation";
import { rejectProfileIdentity, type RejectionStore } from "../../lib/identity/rejection";
import { postgresIdentityStore } from "../../lib/identity/postgres-confirmation";
import { postgresRejectionStore } from "../../lib/identity/postgres-rejection";
import { enqueueInTransaction } from "../../lib/processing/enqueue";
import { postgresJobs } from "../../lib/processing/postgres-jobs";
import type { Lease } from "../../lib/processing/worker";

export async function validateIdentityDependencies(connection: Connection) {
  markValidationStage("identity_dependency_invalidation");
  const rollback = new Error("IDENTITY_DEPENDENCY_FIXTURE_ROLLBACK"); let checks = 0;
  try {
    await connection.begin("isolation level read committed", async (sql) => {
      await sql`set local statement_timeout = '20s'`;
      const person = randomUUID(), other = randomUUID(), snapshotId = randomUUID(), child = randomUUID();
      const note = randomUUID(), relationship = randomUUID(), content = 'Identity dependency fixture';
      for (const id of [person, other]) await sql`insert into public.person (id, profile_url, name)
        values (${id}, ${`https://www.linkedin.com/in/identity-dependency-${id}/`}, 'Identity dependency fixture')`;
      await sql`insert into public.snapshot (id, capture_type, source_url, content_gzip, content_hash, adapter_id, parser_version)
        values (${snapshotId}, 'profile', 'https://www.linkedin.com/in/identity-dependency-fixture/', ${gzipSync(content)},
          ${createHash('sha256').update(content).digest('hex')}, 'linkedin', 'validation')`;
      await sql`insert into public.encounter (id, kind, occurred_at, snapshot_id) values (${randomUUID()}, 'captured', now(), ${snapshotId})`;
      const target = fixtureConnection(sql), confirmations = postgresIdentityStore(target), rejections = postgresRejectionStore(target);
      const originalRequest = { requestId: randomUUID(), snapshotId, personId: person };
      const original = await confirmProfileIdentity(originalRequest, confirmations);
      await sql`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text, support_status)
        values (${child}, ${other}, 'inferred', 'summary', 'Dependent identity claim', 'partial'),
          (${note}, ${other}, 'user', 'note', 'Retained User words', 'verified')`;
      await sql`insert into public.observation_evidence (observation_id, supporting_observation_id, support_role, evidence_version)
        values (${child}, ${original.proof.id}, 'supports', 'validation')`;
      await sql`insert into public.relationship (id, from_object_id, to_object_id, predicate, state, origin_key)
        values (${relationship}, ${person}, ${other}, 'similar_trajectory', 'active', ${`fixture:${relationship}`})`;
      await sql`insert into public.relationship_support (relationship_id, observation_id) values (${relationship}, ${child})`;
      const jobId = await enqueueInTransaction(sql, { kind: 'index', snapshotId, targetId: other, fingerprint: 'c'.repeat(64) });
      const lease: Lease = { jobId, snapshotId, kind: 'index', token: randomUUID(), inputFingerprint: 'c'.repeat(64), expiresAt: Date.now() + 120000 };
      await sql`update public.processing_job set state = 'leased', attempts = 1, lease_token = ${lease.token},
        leased_until = clock_timestamp() + interval '120 seconds' where id = ${jobId}`;
      await sql`insert into public.processing_run (job_id, lease_token, input_fingerprint, outcome)
        values (${jobId}, ${lease.token}, ${lease.inputFingerprint}, 'running')`;
      const request = { ...originalRequest, requestId: randomUUID() };
      const failing: IdentityStore = { transaction(id, work) {
        return confirmations.transaction(id, (tx) => work({ ...tx, async queueParse() { throw new Error('FIXTURE_QUEUE_FAILURE'); } }));
      } };
      await assert.rejects(confirmProfileIdentity(request, failing), /FIXTURE_QUEUE_FAILURE/); checks++;
      const [unchanged] = await sql`select (select state from public.processing_job where id = ${jobId}) as job,
        (select state from public.relationship where id = ${relationship}) as relationship,
        (select count(*)::int from public.observation where supersedes_id = ${original.proof.id}) as successors`;
      assert.equal(unchanged!.job, 'leased'); assert.equal(unchanged!.relationship, 'active'); assert.equal(unchanged!.successors, 0); checks += 3;
      const next = await confirmProfileIdentity(request, confirmations);
      assert.equal(next.proof.supersedesId, original.proof.id); checks++;
      const [withdrawn] = await sql`select (select state from public.processing_job where id = ${jobId}) as job,
        (select outcome from public.processing_run where lease_token = ${lease.token}) as run,
        (select state from public.relationship where id = ${relationship}) as relationship`;
      assert.equal(withdrawn!.job, 'superseded'); assert.equal(withdrawn!.run, 'superseded'); assert.equal(withdrawn!.relationship, 'candidate'); checks += 3;
      let applied = false;
      const worker = postgresJobs(target, async () => { applied = true; });
      assert.equal(await worker.complete(lease, {}, 'succeeded', Date.now()), false); assert.equal(applied, false); checks += 2;
      const newJob = await enqueueInTransaction(sql, { kind: 'index', snapshotId, targetId: other, fingerprint: 'd'.repeat(64) });
      await confirmProfileIdentity(request, confirmations); await confirmProfileIdentity(originalRequest, confirmations);
      const [replayed] = await sql`select state from public.processing_job where id = ${newJob}`;
      assert.equal(replayed!.state, 'queued'); checks++;
      const rejectRequest = { requestId: randomUUID(), snapshotId, observationId: next.proof.id };
      const failingRejection: RejectionStore = { transaction(id, work) {
        return rejections.transaction(id, (tx) => work({ ...tx, async queueParse() { throw new Error('FIXTURE_QUEUE_FAILURE'); } }));
      } };
      await assert.rejects(rejectProfileIdentity(rejectRequest, failingRejection), /FIXTURE_QUEUE_FAILURE/); checks++;
      const [rejectRollback] = await sql`select (select state from public.processing_job where id = ${newJob}) as job,
        (select count(*)::int from public.observation_review where observation_id = ${next.proof.id}) as reviews`;
      assert.equal(rejectRollback!.job, 'queued'); assert.equal(rejectRollback!.reviews, 0); checks += 2;
      await rejectProfileIdentity(rejectRequest, rejections);
      const [rejected] = await sql`select state from public.processing_job where id = ${newJob}`;
      assert.equal(rejected!.state, 'superseded'); checks++;
      const latestJob = await enqueueInTransaction(sql, { kind: 'index', snapshotId, targetId: other, fingerprint: 'e'.repeat(64) });
      assert.equal((await rejectProfileIdentity(rejectRequest, rejections)).replayed, true); checks++;
      const [latest] = await sql`select state from public.processing_job where id = ${latestJob}`;
      assert.equal(latest!.state, 'queued'); checks++;
      const [retained] = await sql`select (select body_text from public.observation where id = ${note}) as note,
        (select count(*)::int from public.observation where id in (${original.proof.id}, ${next.proof.id}, ${child})) as history`;
      assert.equal(retained!.note, 'Retained User words'); assert.equal(retained!.history, 3); checks += 2;
      await sql`set constraints all immediate`; throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  return checks;
}
