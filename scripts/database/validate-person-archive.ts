import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fixtureConnection, type Connection } from "./fixture-connection";
import { markValidationStage } from "./validation-stage";
import { archivePerson, type PersonArchiveStore } from "../../lib/review/person-archive";
import { postgresPersonArchiveStore } from "../../lib/review/postgres-person-archive";
import { confirmProfileIdentity } from "../../lib/identity/confirmation";
import { postgresIdentityStore } from "../../lib/identity/postgres-confirmation";
import { rejectObservation } from "../../lib/review/rejection";
import { postgresReviewStore } from "../../lib/review/postgres-rejection";
import { enqueueInTransaction } from "../../lib/processing/enqueue";
import { postgresJobs } from "../../lib/processing/postgres-jobs";
import type { Lease } from "../../lib/processing/worker";

export async function validatePersonArchive(connection: Connection) {
  markValidationStage("person_archive");
  const rollback = new Error("PERSON_ARCHIVE_FIXTURE_ROLLBACK"); let checks = 0;
  try {
    await connection.begin("isolation level read committed", async (sql) => {
      await sql`set local statement_timeout = '20s'`;
      const personId = randomUUID(), other = randomUUID(), empty = randomUUID(), snapshotId = randomUUID();
      const child = randomUUID(), note = randomUUID(), ownNote = randomUUID(), encounter = randomUUID(), relation = randomUUID();
      const content = 'Person archive fixture';
      for (const id of [personId, other, empty]) await sql`insert into public.person (id, profile_url, name)
        values (${id}, ${`https://www.linkedin.com/in/person-archive-${id}/`}, 'Person archive fixture')`;
      await sql`insert into public.snapshot (id, capture_type, source_url, content_gzip, content_hash, adapter_id, parser_version)
        values (${snapshotId}, 'profile', 'https://www.linkedin.com/in/person-archive-fixture/', ${gzipSync(content)},
          ${createHash('sha256').update(content).digest('hex')}, 'linkedin', 'validation')`;
      await sql`insert into public.encounter (id, kind, occurred_at, snapshot_id) values (${encounter}, 'captured', now(), ${snapshotId})`;
      const target = fixtureConnection(sql), identities = postgresIdentityStore(target);
      const identity = { requestId: randomUUID(), snapshotId, personId };
      const proof = await confirmProfileIdentity(identity, identities);
      await sql`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text, support_status)
        values (${child}, ${other}, 'inferred', 'summary', 'Dependent Person claim', 'partial'),
          (${note}, ${other}, 'user', 'note', 'Independent User words', 'verified'),
          (${ownNote}, ${personId}, 'user', 'note', 'Retained own words', 'verified')`;
      await sql`insert into public.observation_evidence (observation_id, supporting_observation_id, support_role, evidence_version)
        values (${child}, ${proof.proof.id}, 'supports', 'validation'), (${note}, ${proof.proof.id}, 'supports', 'validation')`;
      // Endpoint withdrawal must work even without a supporting assertion.
      await sql`insert into public.relationship (id, from_object_id, to_object_id, predicate, state, origin_key)
        values (${relation}, ${personId}, ${other}, 'similar_trajectory', 'active', ${`fixture:${relation}`})`;
      const ownJob = await enqueueInTransaction(sql, { kind: 'index', snapshotId, targetId: personId, fingerprint: 'a'.repeat(64) });
      const childJob = await enqueueInTransaction(sql, { kind: 'enrich', snapshotId, targetId: other, fingerprint: 'b'.repeat(64) });
      const [parse] = await sql`select id, input_fingerprint from public.processing_job where scope_key = ${`parse:snapshot:${snapshotId}`}`;
      const lease: Lease = { jobId: parse!.id, snapshotId, kind: 'parse', token: randomUUID(),
        inputFingerprint: parse!.input_fingerprint, expiresAt: Date.now() + 120000 };
      await sql`update public.processing_job set state = 'leased', attempts = 1, lease_token = ${lease.token},
        leased_until = clock_timestamp() + interval '120 seconds' where id = ${lease.jobId}`;
      await sql`insert into public.processing_run (job_id, lease_token, input_fingerprint, outcome)
        values (${lease.jobId}, ${lease.token}, ${lease.inputFingerprint}, 'running')`;
      const store = postgresPersonArchiveStore(target), request = { requestId: randomUUID(), personId };
      const failing: PersonArchiveStore = { transaction(id, work) {
        return store.transaction(id, (tx) => work({ ...tx, async insertReceipt() { throw new Error('FIXTURE_RECEIPT_FAILURE'); } }));
      } };
      await assert.rejects(archivePerson(request, failing), /FIXTURE_RECEIPT_FAILURE/); checks++;
      const [unchanged] = await sql`select (select archived_at from public.object_ref where id = ${personId}) as archived,
        (select state from public.processing_job where id = ${lease.jobId}) as job,
        (select state from public.relationship where id = ${relation}) as relation`;
      assert.equal(unchanged!.archived, null); assert.equal(unchanged!.job, 'leased'); assert.equal(unchanged!.relation, 'active'); checks += 3;
      const archived = await archivePerson(request, store), replay = await archivePerson(request, store);
      assert.equal(archived.replayed, false); assert.equal(replay.replayed, true); assert.equal(replay.archivedAt, archived.archivedAt); checks += 3;
      const jobs = await sql`select state from public.processing_job where id in (${ownJob}, ${childJob}, ${lease.jobId})`;
      assert.equal(jobs.length, 3); assert.ok(jobs.every((job) => job.state === 'superseded')); checks += 2;
      const [fenced] = await sql`select (select input_fingerprint from public.processing_head where scope_key = ${`parse:snapshot:${snapshotId}`}) as head,
        (select outcome from public.processing_run where lease_token = ${lease.token}) as run,
        (select state from public.relationship where id = ${relation}) as relation`;
      assert.notEqual(fenced!.head, lease.inputFingerprint); assert.equal(fenced!.run, 'superseded'); assert.equal(fenced!.relation, 'candidate'); checks += 3;
      let applied = false; const worker = postgresJobs(target, async () => { applied = true; });
      assert.equal(await worker.complete(lease, {}, 'succeeded', Date.now()), false); assert.equal(applied, false); checks += 2;
      await assert.rejects(confirmProfileIdentity({ ...identity, requestId: randomUUID() }, identities), /PERSON_UNAVAILABLE/); checks++;
      const reviews = postgresReviewStore(target);
      await assert.rejects(rejectObservation({ requestId: randomUUID(), observationId: child }, reviews), /UNAVAILABLE/); checks++;
      await assert.rejects(rejectObservation({ requestId: randomUUID(), observationId: note }, reviews), /REQUIRES_REVISION/); checks++;
      const [retained] = await sql`select (select body_text from public.observation where id = ${ownNote}) as own,
        (select archived_at from public.object_ref where id = ${ownNote}) as note_archive,
        (select count(*)::int from public.snapshot where id = ${snapshotId}) as snapshots,
        (select count(*)::int from public.encounter_object where encounter_id = ${encounter} and object_id = ${personId}) as links`;
      assert.equal(retained!.own, 'Retained own words'); assert.equal(retained!.note_archive, null);
      assert.equal(retained!.snapshots, 1); assert.equal(retained!.links, 1); checks += 4;
      const newer = await enqueueInTransaction(sql, { kind: 'enrich', snapshotId, targetId: other, fingerprint: 'c'.repeat(64) });
      await archivePerson(request, store);
      const [newJob] = await sql`select state from public.processing_job where id = ${newer}`;
      assert.equal(newJob!.state, 'queued'); checks++;
      await assert.rejects(archivePerson({ ...request, personId: other }, store), /REQUEST_CONFLICT/); checks++;
      await assert.rejects(archivePerson({ ...request, requestId: randomUUID() }, store), /UNAVAILABLE/); checks++;
      await assert.rejects(archivePerson({ requestId: randomUUID(), personId: encounter }, store), /UNAVAILABLE/); checks++;
      const emptyJob = await enqueueInTransaction(sql, { kind: 'index', snapshotId, targetId: empty, fingerprint: 'd'.repeat(64) });
      await archivePerson({ requestId: randomUUID(), personId: empty }, store);
      const [emptyState] = await sql`select state from public.processing_job where id = ${emptyJob}`;
      assert.equal(emptyState!.state, 'superseded'); checks++;
      await sql`set constraints all immediate`; throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  return checks;
}
