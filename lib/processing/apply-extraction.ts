import type postgres from "postgres";
import { canonical } from "../migration/batch";
import { persistEvidence } from "../retrieval/persistence";
import { evidenceStoreInTransaction } from "../retrieval/postgres-evidence";
import { FIELD_EXTRACTOR_VERSION, TEXT_NORMALIZER_VERSION, WEB_NORMALIZER_VERSION } from "./parse-input";
import { verifiedExcerpt } from "../retrieval/evidence";
import type { ExtractionResult } from "./extraction";
import type { Lease } from "./worker";
import { extractionBindings } from "./derivation";
import { projectCapturedArtifact } from "./artifact-projection";

/** Prepared callback for postgresJobs. Requires its current-lease transaction; never creates one. */
export async function applyExtraction(sql: postgres.TransactionSql, lease: Lease, result: ExtractionResult) {
  const bindings = extractionBindings(lease, result);
  if (lease.kind !== "parse" || result.snapshotId !== lease.snapshotId || result.inputFingerprint !== lease.inputFingerprint)
    throw new Error("EXTRACTION_OUTPUT_MISMATCH");
  if (result.state === "quarantined") {
    if (result.representation || result.fields.length || result.code !== "NORMALIZATION_FAILED")
      throw new Error("INVALID_QUARANTINE_OUTPUT");
    await sql`insert into public.quarantine (snapshot_id, adapter_id, parser_version, reason, details)
      values (${lease.snapshotId}, ${result.adapterId ?? "linkedin"}, ${FIELD_EXTRACTOR_VERSION}, 'NORMALIZATION_FAILED',
        ${sql.json({ input_fingerprint: lease.inputFingerprint })})`;
    return;
  }
  const source = result.representation;
  if (!source || source.snapshotId !== lease.snapshotId || (result.fields.length && !result.subject) ||
      ![`${TEXT_NORMALIZER_VERSION}:profile_page`, `${TEXT_NORMALIZER_VERSION}:social_post`, `${WEB_NORMALIZER_VERSION}:article`].includes(source.normalizerVersion))
    throw new Error("INVALID_EXTRACTION_OUTPUT");
  if (result.subject) {
    // Same lock used by observation/review/alias graph triggers; check identity after acquiring it.
    await sql`select pg_advisory_xact_lock(1790703955, 1)`;
    // A legacy person_id or coincident URL is insufficient identity proof.
    const proof = await sql`select o.id from public.observation o join public.object_ref r on r.id = o.subject_id
      join public.object_ref assertion_ref on assertion_ref.id = o.id
      where o.id = ${result.subject.identityObservationId} and o.subject_id = ${result.subject.personId}
        and r.kind = 'person' and r.archived_at is null and assertion_ref.archived_at is null and o.support_status = 'verified'
        and o.truth_layer in ('user','source','extracted')
        and o.structured_value->>'identity_for_snapshot' = ${lease.snapshotId}
        and not exists (select 1 from public.observation_review v where v.observation_id = o.id)
        and not exists (select 1 from public.observation n where n.supersedes_id = o.id)
        and not exists (select 1 from public.object_alias a where a.former_object_id = o.subject_id)
      for share of o, r`;
    const targets = await sql`select distinct x.object_id from public.encounter_object x
      join public.encounter e on e.id = x.encounter_id join public.object_ref r on r.id = x.object_id
      where e.snapshot_id = ${lease.snapshotId} and x.relation = 'noticed' and r.kind = 'person'`;
    if (proof.length !== 1 || targets.length !== 1 || targets[0]?.object_id !== result.subject.personId)
      throw new Error("EXTRACTION_IDENTITY_NOT_VERIFIED");
  }
  for (const field of result.fields) {
    if (field.subjectId !== result.subject?.personId || !['school','role','organization'].includes(field.field) ||
        field.value !== field.quote || !verifiedExcerpt(source.text, field.start, field.end, field.quote))
      throw new Error("INVALID_EXTRACTION_FIELD");
    const structured = { retrieval_field: field.field, value: field.value, extractor_version: FIELD_EXTRACTOR_VERSION,
      snapshot_id: lease.snapshotId, identity_observation_id: result.subject.identityObservationId,
      parse_input_fingerprint: lease.inputFingerprint };
    const fieldKey = `capture_field:${field.field}`;
    await sql`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text,
      structured_value, field_key, support_status, origin_key)
      values (${field.observationId}, ${field.subjectId}, 'extracted', 'fact', ${field.value},
        ${sql.json(structured)}, ${fieldKey}, 'verified', ${field.originKey}) on conflict do nothing`;
    const rows = await sql`select subject_id, truth_layer, semantic_role, body_text, structured_value, field_key,
      support_status, origin_key from public.observation where id = ${field.observationId}`;
    const row = rows[0];
    if (!row || row.subject_id !== field.subjectId || row.truth_layer !== 'extracted' || row.semantic_role !== 'fact' ||
        row.body_text !== field.value || row.field_key !== fieldKey || row.support_status !== 'verified' ||
        row.origin_key !== field.originKey || canonical(row.structured_value) !== canonical(structured))
      throw new Error("EXTRACTION_OBSERVATION_CONFLICT");
    await sql`insert into public.observation_evidence (id, observation_id, snapshot_id, excerpt, support_role, evidence_version)
      values (${field.evidenceId}, ${field.observationId}, ${lease.snapshotId}, ${field.quote}, 'supports',
        ${FIELD_EXTRACTOR_VERSION}) on conflict do nothing`;
    const supports = await sql`select observation_id, snapshot_id, supporting_observation_id, excerpt, support_role, evidence_version
      from public.observation_evidence where id = ${field.evidenceId}`;
    const support = supports[0];
    if (!support || support.observation_id !== field.observationId || support.snapshot_id !== lease.snapshotId ||
        support.supporting_observation_id !== null || support.excerpt !== field.quote || support.support_role !== 'supports' ||
        support.evidence_version !== FIELD_EXTRACTOR_VERSION) throw new Error("EXTRACTION_EVIDENCE_CONFLICT");
  }
  await persistEvidence({ snapshotId: source.snapshotId, normalizerVersion: source.normalizerVersion, text: source.text,
    locators: result.fields.map((field) => ({ evidenceId: field.evidenceId, start: field.start, end: field.end, quote: field.quote })) },
  evidenceStoreInTransaction(sql));
  await projectCapturedArtifact(sql,source);
  for (const binding of bindings) {
    await sql`insert into public.observation_derivation (observation_id, snapshot_id, identity_observation_id,
      job_id, representation_id, input_fingerprint) values (${binding.observationId}, ${binding.snapshotId},
        ${binding.identityObservationId}, ${binding.jobId}, ${binding.representationId}, ${binding.inputFingerprint})
      on conflict (observation_id) do nothing`;
    const rows = await sql`select observation_id as "observationId", snapshot_id as "snapshotId",
      identity_observation_id as "identityObservationId", job_id as "jobId", representation_id as "representationId",
      input_fingerprint as "inputFingerprint" from public.observation_derivation where observation_id = ${binding.observationId}`;
    if (rows.length !== 1 || canonical(rows[0]) !== canonical(binding)) throw new Error("EXTRACTION_DERIVATION_CONFLICT");
  }
}
