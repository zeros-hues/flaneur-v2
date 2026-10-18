import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fixtureConnection, type Connection } from "./fixture-connection";
import { markValidationStage } from "./validation-stage";
import { correctObservation, type CorrectionStore } from "../../lib/review/correction";
import { postgresReviewStore } from "../../lib/review/postgres-rejection";
import { enqueueInTransaction } from "../../lib/processing/enqueue";

export async function validateCorrection(connection: Connection) {
  markValidationStage("observation_correction");
  const rollback = new Error("CORRECTION_FIXTURE_ROLLBACK"); let checks = 0;
  try {
    await connection.begin("isolation level read committed", async (sql) => {
      const person = randomUUID(), snapshot = randomUUID(), original = randomUUID();
      await sql`set local statement_timeout = '20s'`;
      await sql`insert into public.person (id, profile_url, name)
        values (${person}, ${`https://www.linkedin.com/in/correction-fixture-${person}/`}, 'Correction fixture')`;
      await sql`insert into public.snapshot (id, capture_type, source_url, content_gzip, parser_version)
        values (${snapshot}, 'profile', 'https://www.linkedin.com/in/correction-fixture/', ${gzipSync('Old school')}, 'validation')`;
      await sql`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text, structured_value, field_key, support_status)
        values (${original}, ${person}, 'source', 'fact', 'Old school', ${sql.json({ school: 'Old school', snapshot_id: snapshot })}, 'school', 'verified')`;
      await sql`insert into public.observation_evidence (observation_id, snapshot_id, excerpt, support_role, evidence_version)
        values (${original}, ${snapshot}, 'Old school', 'supports', 'validation')`;
      const jobId = await enqueueInTransaction(sql, { kind: 'index', snapshotId: snapshot, targetId: person, fingerprint: 'f'.repeat(64) });
      const store = postgresReviewStore(fixtureConnection(sql));
      const request = { requestId: randomUUID(), observationId: original, bodyText: '  Corrected User words 😀  ', comment: 'Fixture correction' };
      const failing: CorrectionStore = { transaction(id, work) {
        return store.transaction(id, (tx) => work({ ...tx, async invalidate() { throw new Error('FIXTURE_CORRECTION_FAILURE'); } }));
      } };
      await assert.rejects(correctObservation(request, failing), /FIXTURE_CORRECTION_FAILURE/); checks++;
      const [afterFailure] = await sql`select count(*)::int as count from public.observation where supersedes_id = ${original}`;
      assert.equal(afterFailure!.count, 0); checks++;
      const corrected = await correctObservation(request, store);
      const replay = await correctObservation(request, store);
      assert.equal(replay.replayed, true); assert.equal(replay.review.replacementId, corrected.review.replacementId); checks += 2;
      const [replacement] = await sql`select subject_id, truth_layer, semantic_role, body_text, field_key, supersedes_id, structured_value
        from public.observation where id = ${corrected.review.replacementId}`;
      assert.equal(replacement!.subject_id, person); assert.equal(replacement!.truth_layer, 'user');
      assert.equal(replacement!.semantic_role, 'fact'); assert.equal(replacement!.body_text, request.bodyText); checks += 4;
      assert.equal(replacement!.field_key, null); assert.equal(replacement!.supersedes_id, original); checks += 2;
      assert.deepEqual(replacement!.structured_value, { corrected_observation_id: original, correction_review_id: corrected.review.id }); checks++;
      const [old] = await sql`select truth_layer, body_text from public.observation where id = ${original}`;
      assert.equal(old!.truth_layer, 'source'); assert.equal(old!.body_text, 'Old school'); checks += 2;
      const [review] = await sql`select decision, replacement_observation_id from public.observation_review where id = ${corrected.review.id}`;
      assert.equal(review!.decision, 'corrected'); assert.equal(review!.replacement_observation_id, corrected.review.replacementId); checks += 2;
      const [job] = await sql`select state from public.processing_job where id = ${jobId}`;
      assert.equal(job!.state, 'superseded'); checks++;
      const revision = await correctObservation({ requestId: randomUUID(), observationId: corrected.review.replacementId,
        bodyText: 'Second authored revision' }, store);
      const [next] = await sql`select supersedes_id, truth_layer from public.observation where id = ${revision.review.replacementId}`;
      assert.equal(next!.supersedes_id, corrected.review.replacementId); assert.equal(next!.truth_layer, 'user'); checks += 2;
      const newer = await enqueueInTransaction(sql, { kind: 'index', snapshotId: snapshot, targetId: person, fingerprint: 'e'.repeat(64) });
      await correctObservation(request, store);
      const [current] = await sql`select state from public.processing_job where id = ${newer}`;
      assert.equal(current!.state, 'queued'); checks++;
      await assert.rejects(correctObservation({ ...request, bodyText: 'changed payload' }, store), /REQUEST_CONFLICT/); checks++;
      await assert.rejects(correctObservation({ ...request, requestId: randomUUID() }, store), /UNAVAILABLE/); checks++;
      await sql`set constraints all immediate`; throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  return checks;
}
