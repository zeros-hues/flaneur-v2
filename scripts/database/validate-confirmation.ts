import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fixtureConnection, type Connection } from "./fixture-connection";
import { markValidationStage } from "./validation-stage";
import { confirmObservation, type ConfirmationStore } from "../../lib/review/confirmation";
import { postgresReviewStore } from "../../lib/review/postgres-rejection";
import { enqueueInTransaction } from "../../lib/processing/enqueue";

export async function validateConfirmation(connection: Connection) {
  markValidationStage("observation_confirmation");
  const rollback = new Error("CONFIRMATION_FIXTURE_ROLLBACK"); let checks = 0;
  try {
    await connection.begin("isolation level read committed", async (sql) => {
      const person = randomUUID(), original = randomUUID(), child = randomUUID(), snapshot = randomUUID();
      await sql`set local statement_timeout = '20s'`;
      await sql`insert into public.person (id, profile_url, name)
        values (${person}, ${`https://www.linkedin.com/in/confirmation-fixture-${person}/`}, 'Confirmation fixture')`;
      const body = '  Exact inferred words 😀  ';
      await sql`insert into public.snapshot (id, capture_type, source_url, content_gzip, parser_version)
        values (${snapshot}, 'profile', 'https://www.linkedin.com/in/confirmation-fixture/', ${gzipSync(body)}, 'validation')`;
      await sql`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text, structured_value, support_status)
        values (${original}, ${person}, 'inferred', 'fact', ${body}, ${sql.json({ model_value: 'fixture' })}, 'partial'),
          (${child}, ${person}, 'inferred', 'summary', 'Dependent claim', '{}', 'partial')`;
      await sql`insert into public.observation_evidence (observation_id, supporting_observation_id, support_role, evidence_version)
        values (${child}, ${original}, 'supports', 'validation')`;
      const jobId = await enqueueInTransaction(sql, { kind: 'index', snapshotId: snapshot, targetId: person, fingerprint: 'a'.repeat(64) });
      const store = postgresReviewStore(fixtureConnection(sql));
      const request = { requestId: randomUUID(), observationId: original, comment: 'Fixture confirmation' };
      const failing: ConfirmationStore = { transaction(id, work) {
        return store.transaction(id, (tx) => work({ ...tx, async invalidate() { throw new Error('FIXTURE_CONFIRMATION_FAILURE'); } }));
      } };
      await assert.rejects(confirmObservation(request, failing), /FIXTURE_CONFIRMATION_FAILURE/); checks++;
      const [failure] = await sql`select count(*)::int as count from public.observation where supersedes_id = ${original}`;
      assert.equal(failure!.count, 0); checks++;
      const confirmed = await confirmObservation(request, store), replay = await confirmObservation(request, store);
      assert.equal(replay.replayed, true); assert.equal(replay.review.replacementId, confirmed.review.replacementId); checks += 2;
      const [replacement] = await sql`select subject_id, truth_layer, semantic_role, body_text, field_key, supersedes_id, structured_value
        from public.observation where id = ${confirmed.review.replacementId}`;
      assert.equal(replacement!.subject_id, person); assert.equal(replacement!.truth_layer, 'user');
      assert.equal(replacement!.semantic_role, 'fact'); assert.equal(replacement!.body_text, body); checks += 4;
      assert.equal(replacement!.field_key, null); assert.equal(replacement!.supersedes_id, original); checks += 2;
      assert.deepEqual(replacement!.structured_value, { confirmed_observation_id: original, confirmation_review_id: confirmed.review.id }); checks++;
      const [old] = await sql`select truth_layer, body_text, structured_value from public.observation where id = ${original}`;
      assert.equal(old!.truth_layer, 'inferred'); assert.equal(old!.body_text, body);
      assert.deepEqual(old!.structured_value, { model_value: 'fixture' }); checks += 3;
      const [review] = await sql`select decision, replacement_observation_id from public.observation_review where id = ${confirmed.review.id}`;
      assert.equal(review!.decision, 'confirmed'); assert.equal(review!.replacement_observation_id, confirmed.review.replacementId); checks += 2;
      const [job] = await sql`select state from public.processing_job where id = ${jobId}`;
      assert.equal(job!.state, 'superseded'); checks++;
      await assert.rejects(confirmObservation({ requestId: randomUUID(), observationId: child }, store), /UNAVAILABLE/); checks++;
      await assert.rejects(confirmObservation({ requestId: randomUUID(), observationId: confirmed.review.replacementId }, store), /REQUIRES_REVISION/); checks++;
      const newer = await enqueueInTransaction(sql, { kind: 'index', snapshotId: snapshot, targetId: person, fingerprint: 'b'.repeat(64) });
      await confirmObservation(request, store);
      const [current] = await sql`select state from public.processing_job where id = ${newer}`;
      assert.equal(current!.state, 'queued'); checks++;
      await assert.rejects(confirmObservation({ ...request, comment: 'changed' }, store), /REQUEST_CONFLICT/); checks++;
      await assert.rejects(confirmObservation({ ...request, requestId: randomUUID() }, store), /UNAVAILABLE/); checks++;
      await sql`set constraints all immediate`; throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  return checks;
}
