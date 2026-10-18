import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fixtureConnection, type Connection } from "./fixture-connection";
import { markValidationStage } from "./validation-stage";
import { rejectObservation, type ReviewStore } from "../../lib/review/rejection";
import { postgresReviewStore } from "../../lib/review/postgres-rejection";
import { enqueueInTransaction } from "../../lib/processing/enqueue";
import { postgresJobs } from "../../lib/processing/postgres-jobs";
import type { Lease } from "../../lib/processing/worker";

export async function validateReview(connection: Connection) {
  markValidationStage("observation_review_invalidation");
  const rollback = new Error("REVIEW_FIXTURE_ROLLBACK"); let checks = 0;
  try {
    await connection.begin("isolation level read committed", async (sql) => {
      await sql`set local statement_timeout = '20s'`;
      const person = randomUUID(), other = randomUUID(), snapshot = randomUUID(), note = randomUUID();
      const root = randomUUID(), child = randomUUID(), relationship = randomUUID();
      for (const id of [person, other]) await sql`insert into public.person (id, profile_url, name)
        values (${id}, ${`https://www.linkedin.com/in/review-fixture-${id}/`}, 'Review fixture')`;
      await sql`insert into public.snapshot (id, capture_type, source_url, content_gzip, parser_version)
        values (${snapshot}, 'profile', 'https://www.linkedin.com/in/review-fixture/', ${gzipSync('fixture')}, 'validation')`;
      await sql`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text, support_status)
        values (${note}, ${person}, 'user', 'note', 'Original User words', 'verified')`;
      await sql`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text, support_status, structured_value)
        values (${root}, ${person}, 'inferred', 'relationship_assertion', 'Proposed related trajectory', 'partial',
          ${sql.json({ to_object_id: other })})`;
      await sql`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text, support_status)
        values (${child}, ${other}, 'inferred', 'summary', 'Dependent claim', 'partial')`;
      await sql`insert into public.observation_evidence (observation_id, supporting_observation_id, support_role, evidence_version)
        values (${root}, ${note}, 'supports', 'validation'), (${child}, ${root}, 'supports', 'validation')`;
      await sql`insert into public.relationship (id, from_object_id, to_object_id, predicate, state, origin_key)
        values (${relationship}, ${person}, ${other}, 'similar_trajectory', 'active', ${`fixture:${relationship}`})`;
      await sql`insert into public.relationship_support (relationship_id, observation_id) values (${relationship}, ${root})`;
      const rootJob = await enqueueInTransaction(sql, { kind: 'enrich', snapshotId: snapshot, targetId: person, fingerprint: 'c'.repeat(64) });
      const childJob = await enqueueInTransaction(sql, { kind: 'index', snapshotId: snapshot, targetId: other, fingerprint: 'd'.repeat(64) });
      const lease: Lease = { jobId: rootJob, snapshotId: snapshot, kind: 'enrich', inputFingerprint: 'c'.repeat(64),
        token: randomUUID(), expiresAt: Date.now() + 120000 };
      await sql`update public.processing_job set state = 'leased', attempts = 1, lease_token = ${lease.token},
        leased_until = clock_timestamp() + interval '120 seconds' where id = ${rootJob}`;
      await sql`insert into public.processing_run (job_id, lease_token, input_fingerprint, outcome)
        values (${rootJob}, ${lease.token}, ${lease.inputFingerprint}, 'running')`;
      await sql`set constraints all immediate`; await sql`set constraints all deferred`;
      const target = fixtureConnection(sql), store = postgresReviewStore(target);
      const request = { requestId: randomUUID(), observationId: root, comment: 'Fixture rejection' };
      const failing: ReviewStore = { transaction(id, work) {
        return store.transaction(id, (tx) => work({ ...tx, async invalidate() { throw new Error('FIXTURE_INVALIDATION_FAILURE'); } }));
      } };
      await assert.rejects(rejectObservation(request, failing), /FIXTURE_INVALIDATION_FAILURE/); checks++;
      const [rolledBack] = await sql`select (select count(*)::int from public.observation_review where observation_id = ${root}) as reviews,
        (select state from public.relationship where id = ${relationship}) as state`;
      assert.equal(rolledBack!.reviews, 0); assert.equal(rolledBack!.state, 'active'); checks += 2;
      const result = await rejectObservation(request, store);
      const replay = await rejectObservation(request, store);
      assert.equal(result.replayed, false); assert.equal(replay.replayed, true); checks += 2;
      const jobs = await sql`select state from public.processing_job where id in (${rootJob}, ${childJob}) order by id`;
      assert.equal(jobs.length, 2); assert.ok(jobs.every((job) => job.state === 'superseded')); checks += 2;
      const [run] = await sql`select outcome from public.processing_run where lease_token = ${lease.token}`;
      assert.equal(run!.outcome, 'superseded'); checks++;
      let applied = false;
      const worker = postgresJobs(target, async () => { applied = true; });
      assert.equal(await worker.complete(lease, {}, 'succeeded', Date.now()), false); assert.equal(applied, false); checks += 2;
      const [retained] = await sql`select (select count(*)::int from public.observation where id in (${root}, ${child}, ${note})) as observations,
        (select state from public.relationship where id = ${relationship}) as state,
        (select body_text from public.observation where id = ${note}) as text`;
      assert.equal(retained!.observations, 3); assert.equal(retained!.state, 'candidate');
      assert.equal(retained!.text, 'Original User words'); checks += 3;
      const newer = await enqueueInTransaction(sql, { kind: 'index', snapshotId: snapshot, targetId: other, fingerprint: 'e'.repeat(64) });
      await rejectObservation(request, store);
      const [current] = await sql`select state from public.processing_job where id = ${newer}`;
      assert.equal(current!.state, 'queued'); checks++;
      await assert.rejects(rejectObservation({ ...request, comment: 'Changed' }, store), /REQUEST_CONFLICT/); checks++;
      await assert.rejects(rejectObservation({ requestId: randomUUID(), observationId: child }, store), /UNAVAILABLE/); checks++;
      await assert.rejects(rejectObservation({ requestId: randomUUID(), observationId: note }, store), /AUTHORED_TEXT_REQUIRES_REVISION/); checks++;
      await sql`set constraints all immediate`; throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  return checks;
}
