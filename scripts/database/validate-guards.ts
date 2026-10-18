import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type postgres from "postgres";

interface Fixture { snapshotId: string; personId: string; noteId: string; observationId: string;
  evidenceId: string; representationId: string; jobId: string }
export async function validateGuards(sql: postgres.TransactionSql, fixture: Fixture) {
  let checks = 0;
  async function rejects(work: (tx: postgres.TransactionSql) => Promise<unknown>, expected = "23514") {
    let code: unknown;
    try { await sql.savepoint(work); } catch (error) {
      code = error && typeof error === "object" && "code" in error ? error.code : null;
    }
    assert.equal(code, expected); checks++;
  }
  await rejects((tx) => tx`update public.observation set body_text = 'changed' where id = ${fixture.noteId}`);
  await rejects((tx) => tx`update public.snapshot set source_url = 'https://invalid.example/' where id = ${fixture.snapshotId}`);
  await rejects((tx) => tx`update public.snapshot_representation set text = 'changed' where id = ${fixture.representationId}`);
  await rejects((tx) => tx`update public.text_evidence set quote = 'changed' where evidence_id = ${fixture.evidenceId}`);
  await rejects((tx) => tx`update public.observation_derivation set input_fingerprint = ${"b".repeat(64)} where observation_id = ${fixture.observationId}`);
  await rejects((tx) => tx`update public.processing_job set input_fingerprint = ${"b".repeat(64)} where id = ${fixture.jobId}`);
  await rejects((tx) => tx`insert into public.snapshot_representation (id, snapshot_id, normalizer_version, text, text_hash)
    values (${randomUUID()}, ${fixture.snapshotId}, 'invalid-hash-fixture', 'EPFL', ${"a".repeat(64)})`);
  await rejects(async (tx) => {
    const observationId = randomUUID(), evidenceId = randomUUID();
    await tx`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text, structured_value, field_key, support_status)
      select ${observationId}, subject_id, truth_layer, semantic_role, body_text, structured_value, field_key, support_status
      from public.observation where id = ${fixture.observationId}`;
    await tx`insert into public.observation_evidence (id, observation_id, snapshot_id, excerpt, support_role, evidence_version)
      values (${evidenceId}, ${observationId}, ${fixture.snapshotId}, 'EPFL', 'supports', 'validation')`;
    await tx`insert into public.text_evidence (evidence_id, representation_id, start_codepoint, end_codepoint, quote)
      select ${evidenceId}, representation_id, start_codepoint, end_codepoint, quote from public.text_evidence where evidence_id = ${fixture.evidenceId}`;
    await tx`insert into public.observation_derivation (observation_id, snapshot_id, identity_observation_id, job_id, representation_id, input_fingerprint)
      select ${observationId}, snapshot_id, identity_observation_id, job_id, representation_id, ${"b".repeat(64)}
      from public.observation_derivation where observation_id = ${fixture.observationId}`;
  });
  await rejects((tx) => tx`delete from public.observation where id =
    (select identity_observation_id from public.observation_derivation where observation_id = ${fixture.observationId})`, "23503");
  await rejects((tx) => tx`insert into public.observation_evidence (id, observation_id, snapshot_id, supporting_observation_id,
    excerpt, support_role, evidence_version) values (${randomUUID()}, ${fixture.observationId}, ${fixture.snapshotId},
      ${fixture.noteId}, 'EPFL', 'supports', 'validation')`);
  await rejects(async (tx) => {
    const id = randomUUID();
    await tx`insert into public.observation_evidence (id, observation_id, snapshot_id, excerpt, support_role, evidence_version)
      values (${id}, ${fixture.observationId}, ${fixture.snapshotId}, 'wrong', 'supports', 'validation')`;
    await tx`insert into public.text_evidence (evidence_id, representation_id, start_codepoint, end_codepoint, quote)
      values (${id}, ${fixture.representationId}, 0, 5, 'wrong')`;
  });
  await rejects(async (tx) => {
    const id = randomUUID();
    await tx`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text, support_status)
      values (${id}, ${fixture.personId}, 'extracted', 'fact', 'unsupported', 'verified')`;
    await tx`set constraints all immediate`;
  });
  await rejects(async (tx) => {
    const other = randomUUID(), decision = randomUUID();
    await tx`insert into public.person (id, profile_url, name) values (${other}, ${`https://www.linkedin.com/in/fixture-${other}/`}, 'Second fixture')`;
    await tx`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text, support_status)
      values (${decision}, ${fixture.personId}, 'user', 'note', 'fixture decision', 'verified')`;
    await tx`insert into public.object_alias (former_object_id, canonical_object_id, decision_observation_id)
      values (${fixture.personId}, ${other}, ${decision}), (${other}, ${fixture.personId}, ${decision})`;
    await tx`set constraints all immediate`;
  });
  return checks;
}
