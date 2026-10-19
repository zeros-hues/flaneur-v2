import {validateTrajectory} from './validate-trajectory';
import {validateCareer} from './validate-career';
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import type postgres from "postgres";
import { confirmProfileIdentity } from "../../lib/identity/confirmation";
import { rejectProfileIdentity } from "../../lib/identity/rejection";
import type { RejectionStore } from "../../lib/identity/rejection";
import { postgresIdentityStore } from "../../lib/identity/postgres-confirmation";
import { postgresRejectionStore } from "../../lib/identity/postgres-rejection";
import { extractionProcessor, type ExtractionResult } from "../../lib/processing/extraction";
import { postgresJobs } from "../../lib/processing/postgres-jobs";
import { applyExtraction } from "../../lib/processing/apply-extraction";
import type { Lease } from "../../lib/processing/worker";
import { postgresRetrievalReader } from "../../lib/retrieval/postgres-reader";
import { validateGuards } from "./validate-guards";
import { fixtureConnection } from "./fixture-connection";
import { validateWorker } from "./validate-worker";
import { validateContention } from "./validate-contention";
import { validateReview } from "./validate-review";
import { validateCorrection } from "./validate-correction";
import { validateConfirmation } from "./validate-confirmation";
import { validateIdentityDependencies } from "./validate-identity-dependencies";
import { validateArchive } from "./validate-archive";
import { validatePersonArchive } from "./validate-person-archive";
import { validateExport } from "./validate-export";
import { validateSessionModes } from "./validate-session";
import { validateThrottle } from "./validate-throttle";
import { validateInspection } from "./validate-inspection";
import { validateIdentityInspection } from "./validate-identity-inspection";
import { validateArchiveCompatibility } from "./validate-archive-compatibility";
import { validateContextualWalk } from "./validate-contextual-walk";
import { validateWalkSessions } from "./validate-walk-sessions";
import { validateWalkContention } from "./validate-walk-contention";
import { validateMemoryInspection } from "./validate-memory-inspection";
import { validateMemoryTrail } from "./validate-memory-trail";
import { validateCaptureRuntime } from "./validate-capture-runtime";
import { validateSourceResolution } from "./validate-source-resolution";
import { validateSourceIdentity } from "./validate-source-identity";
import { validatePersonCreation } from "./validate-person-creation";
import {validateIdentityReassignment} from './validate-identity-reassignment';
import {validateProfileRelationships} from './validate-profile-relationships';
import {validateAuthorship} from './validate-authorship';
import {validateRelationshipRetrieval} from './validate-relationship-retrieval';
import {validateConceptAssociations} from './validate-concept-associations';
import {validateConceptRetrieval} from './validate-concept-retrieval';
import { validateNoteAuthoring } from "./validate-note-authoring";
import { validateMemoryQuery } from "./validate-memory-query";
import { markValidationStage } from "./validation-stage";
export { validationStage } from "./validation-stage";

type Connection = ReturnType<typeof postgres>;
const rollback = new Error("SQL_VALIDATION_ROLLBACK");

async function counts(connection: Connection) {
  return connection.begin("isolation level repeatable read read only", async (sql) => {
    const rows = await sql`select (select count(*)::int from public.person) as people,
      (select count(*)::int from public.snapshot) as snapshots, (select count(*)::int from public.note) as notes,
      (select count(*)::int from public.observation) as observations, (select count(*)::int from public.encounter) as encounters,
      (select count(*)::int from public.observation_review) as reviews, (select count(*)::int from public.object_ref) as refs,
      (select count(*)::int from public.processing_head) as heads, (select count(*)::int from public.processing_job) as jobs,
      (select count(*)::int from public.processing_run) as runs, (select count(*)::int from public.observation_evidence) as supports,
      (select count(*)::int from public.snapshot_representation) as representations,
      (select count(*)::int from public.text_evidence) as locators, (select count(*)::int from public.observation_derivation) as derivations,
      (select count(*)::int from public.migration_receipt) as operation_receipts`;
    return rows[0];
  });
}
export async function validate(connection: Connection) {
  const before = await counts(connection);
  let checks = await validateWorker(connection);
  checks += await validateContention(connection);
  checks += await validateReview(connection);
  checks += await validateCorrection(connection);
  checks += await validateConfirmation(connection);
  checks += await validateIdentityDependencies(connection);
  checks += await validateArchive(connection);
  checks += await validatePersonArchive(connection);
  checks += await validateExport(connection);
  checks += (await validateSessionModes(connection)).checks;
  markValidationStage("identity_extraction_guards");
  try {
    await connection.begin("isolation level read committed", async (sql) => {
      await sql`set local statement_timeout = '20s'`;
      await sql`set local lock_timeout = '5s'`;
      const target = fixtureConnection(sql);
      const snapshotId = randomUUID(), personId = randomUUID(), encounterId = randomUUID(), noteId = randomUUID();
      const html = `<section aria-label="Primary content"><h2>SQL Fixture</h2><p>robotics</p>
        <section componentkey="EducationTopLevelSection"><a href="/school/epfl/">EPFL</a></section></section>`;
      const contentGzip = gzipSync(html), contentHash = createHash("sha256").update(html).digest("hex");
      const sourceUrl = `https://www.linkedin.com/in/sql-validation-${personId}/`;
      await sql`insert into public.person (id, profile_url, name) values (${personId}, ${sourceUrl}, 'SQL validation fixture')`;
      await sql`insert into public.snapshot (id, capture_type, source_url, content_gzip, content_hash, adapter_id, parser_version)
        values (${snapshotId}, 'profile', ${sourceUrl}, ${contentGzip}, ${contentHash}, 'linkedin', 'validation')`;
      await sql`insert into public.encounter (id, kind, occurred_at, snapshot_id) values (${encounterId}, 'captured', now(), ${snapshotId})`;
      await sql`insert into public.observation (id, subject_id, truth_layer, semantic_role, body_text, support_status)
        values (${noteId}, ${encounterId}, 'user', 'reason_for_noticing', 'robotics', 'verified')`;
      const identityStore = postgresIdentityStore(target), rejectionStore = postgresRejectionStore(target);
      const request = { requestId: randomUUID(), snapshotId, personId };
      const confirmed = await confirmProfileIdentity(request, identityStore);
      const replay = await confirmProfileIdentity(request, identityStore);
      assert.equal(replay.replayed, true); assert.equal(replay.proof.id, confirmed.proof.id); checks += 2;
      const rows = await sql`select id, input_fingerprint from public.processing_job where scope_key = ${`parse:snapshot:${snapshotId}`}`;
      assert.equal(rows.length, 1); checks++;
      const lease: Lease = { jobId: rows[0]!.id, token: randomUUID(), inputFingerprint: rows[0]!.input_fingerprint,
        snapshotId, kind: "parse", expiresAt: Date.now() + 120000 };
      await sql`update public.processing_job set state = 'leased', attempts = 1, lease_token = ${lease.token},
        leased_until = clock_timestamp() + interval '120 seconds' where id = ${lease.jobId}`;
      await sql`insert into public.processing_run (job_id, lease_token, input_fingerprint, outcome)
        values (${lease.jobId}, ${lease.token}, ${lease.inputFingerprint}, 'running')`;
      const jobs = postgresJobs<ExtractionResult>(target, applyExtraction, ["parse"]);
      assert.equal(await jobs.renew(lease, 120000), true); checks++;
      const processor = extractionProcessor(async () => ({ id: snapshotId, contentGzip, contentHash, sourceUrl,
        adapterId: "linkedin", kind: "profile_page", subject: { personId, identityObservationId: confirmed.proof.id } }));
      const extracted = await processor(lease, async () => jobs.renew(lease, 120000));
      assert.equal(extracted.result.fields.length, 1); checks++;
      assert.equal(await jobs.complete(lease, extracted.result, extracted.outcome, Date.now()), true); checks++;
      await sql`set constraints all immediate`;
      await sql`set constraints all deferred`;
      const field = extracted.result.fields[0]!;
      const derivations = await sql`select identity_observation_id, representation_id, job_id from public.observation_derivation
        where observation_id = ${field.observationId}`;
      assert.equal(derivations.length, 1); assert.equal(derivations[0]!.identity_observation_id, confirmed.proof.id);
      assert.equal(derivations[0]!.representation_id, extracted.result.representation!.id); checks += 3;
      checks += await validateGuards(sql, { snapshotId, personId, noteId, observationId: field.observationId,
        evidenceId: field.evidenceId, representationId: extracted.result.representation!.id, jobId: lease.jobId });
      const rejection = { requestId: randomUUID(), snapshotId, observationId: confirmed.proof.id, comment: "Fixture rejection" };
      await rejectProfileIdentity(rejection, rejectionStore);
      const repeated = await rejectProfileIdentity(rejection, rejectionStore);
      assert.equal(repeated.replayed, true); checks++;
      assert.equal(await jobs.complete(lease, extracted.result, extracted.outcome, Date.now()), false); checks++;
      const retained = await sql`select (select count(*)::int from public.observation where id = ${noteId}) as notes,
        (select count(*)::int from public.observation_derivation where observation_id = ${field.observationId}) as history`;
      assert.equal(retained[0]!.notes, 1); assert.equal(retained[0]!.history, 1); checks += 2;
      const newer = await confirmProfileIdentity({ ...request, requestId: randomUUID() }, identityStore);
      const [headBefore] = await sql`select input_fingerprint from public.processing_head where scope_key = ${`parse:snapshot:${snapshotId}`}`;
      await rejectProfileIdentity(rejection, rejectionStore);
      const [headAfter] = await sql`select input_fingerprint from public.processing_head where scope_key = ${`parse:snapshot:${snapshotId}`}`;
      assert.notEqual(newer.proof.id, confirmed.proof.id); assert.equal(headBefore!.input_fingerprint, headAfter!.input_fingerprint); checks += 2;
      // An actual leased input, invalidated before completion, cannot append its outputs.
      const [currentJob] = await sql`select id, input_fingerprint from public.processing_job
        where scope_key = ${`parse:snapshot:${snapshotId}`} and input_fingerprint = ${headAfter!.input_fingerprint}`;
      const staleLease: Lease = { ...lease, jobId: currentJob!.id, token: randomUUID(), inputFingerprint: currentJob!.input_fingerprint };
      await sql`update public.processing_job set state = 'leased', attempts = 1, lease_token = ${staleLease.token},
        leased_until = clock_timestamp() + interval '120 seconds' where id = ${staleLease.jobId}`;
      await sql`insert into public.processing_run (job_id, lease_token, input_fingerprint, outcome)
        values (${staleLease.jobId}, ${staleLease.token}, ${staleLease.inputFingerprint}, 'running')`;
      const newerProcessor = extractionProcessor(async () => ({ id: snapshotId, contentGzip, contentHash, sourceUrl,
        adapterId: "linkedin", kind: "profile_page", subject: { personId, identityObservationId: newer.proof.id } }));
      const staleResult = await newerProcessor(staleLease, async () => jobs.renew(staleLease, 120000));
      const failedReview = { requestId: randomUUID(), snapshotId, observationId: newer.proof.id, comment: null };
      const failing: RejectionStore = { transaction(id, work) {
        return rejectionStore.transaction(id, (tx) => work({ ...tx, async queueParse() { throw new Error("FIXTURE_QUEUE_FAILURE"); } }));
      } };
      await assert.rejects(rejectProfileIdentity(failedReview, failing), /FIXTURE_QUEUE_FAILURE/); checks++;
      const [stillActive] = await sql`select count(*)::int as reviews from public.observation_review where observation_id = ${newer.proof.id}`;
      assert.equal(stillActive!.reviews, 0); checks++;
      const rejectedNewer = await rejectProfileIdentity(failedReview, rejectionStore);
      assert.equal(await jobs.complete(staleLease, staleResult.result, staleResult.outcome, Date.now()), false); checks++;
      const [obsolete] = await sql`select state, lease_token from public.processing_job where id = ${staleLease.jobId}`;
      assert.equal(obsolete!.state, "superseded"); assert.equal(obsolete!.lease_token, null); checks += 2;
      const [notAppended] = await sql`select count(*)::int as fields from public.observation where id = ${staleResult.result.fields[0]!.observationId}`;
      assert.equal(notAppended!.fields, 0); checks++;
      let reviewMutationCode: unknown;
      try { await sql.savepoint((tx) => tx`update public.observation_review set comment = 'changed' where id = ${rejectedNewer.review.id}`); }
      catch (error) { reviewMutationCode = error && typeof error === "object" && "code" in error ? error.code : null; }
      assert.equal(reviewMutationCode, "23514"); checks++;
      await sql`set constraints all immediate`;
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  const after = await counts(connection);
  markValidationStage("rollback_counts");
  assert.deepEqual(after, before); checks++;
  // Execute the actual read-only reader after fixtures have been rolled back. Never print corpus data.
  const read = await postgresRetrievalReader(connection).read({ mode: "recall", terms: ["sql validation fixture"], constraints: [] });
  markValidationStage("read_only_reader");
  assert.ok(!Array.isArray(read)); checks++;
  return { status: "sql_validation_passed", connection_setting: "DIRECT_URL", checks,
    fixtures_rolled_back: true, aggregate_counts_unchanged: true, read_only_reader_executed: true };
}

/** Session changes need no worker queue; focused validation preserves the same aggregate rollback check. */
export async function validateSessionsOnly(connection: Connection) {
  markValidationStage("session_counts_before");
  const before = await counts(connection);
  const session = await validateSessionModes(connection);
  markValidationStage("session_counts_after");
  assert.deepEqual(await counts(connection), before);
  return { status: "session_validation_passed", connection_setting: "DIRECT_URL", checks: session.checks + 1,
    tested_schema_modes: session.modes, fixtures_rolled_back: true, auth_state_unchanged: session.authStateUnchanged,
    auth_schema_absent: session.authSchemaAbsent, aggregate_counts_unchanged: true, migration_applied: false };
}

export async function validateThrottleOnly(connection: Connection) {
  const before = await counts(connection);
  const throttle = await validateThrottle(connection);
  assert.deepEqual(await counts(connection), before);
  return { status: "throttle_validation_passed", connection_setting: "DIRECT_URL", checks: throttle.checks + 1,
    schema_mode: throttle.schemaMode, fixtures_rolled_back: true, throttle_state_unchanged: true,
    aggregate_counts_unchanged: true, migration_applied: false };
}

export async function validateExportOnly(connection: Connection) {
  const before = await counts(connection);
  const checks = await validateExport(connection);
  assert.deepEqual(await counts(connection), before);
  return { status: "export_validation_passed", connection_setting: "DIRECT_URL", checks: checks + 1,
    fixtures_rolled_back: true, aggregate_counts_unchanged: true, private_export_file_created: false };
}

/** Actual review stores, synthetic mutations only. Each existing fixture rolls back its own transaction. */
export async function validateReviewsOnly(connection: Connection) {
  const before = await counts(connection); let checks = 0;
  for (const run of [validateReview, validateCorrection, validateConfirmation, validateArchive,
    validatePersonArchive, validateIdentityDependencies]) checks += await run(connection);
  assert.deepEqual(await counts(connection), before);
  return { status: "review_validation_passed", connection_setting: "DIRECT_URL", checks: checks + 1,
    fixtures_rolled_back: true, aggregate_counts_unchanged: true, real_review_submitted: false };
}

export async function validateInspectionOnly(connection: Connection) {
  const before = await counts(connection), checks = await validateInspection(connection);
  assert.deepEqual(await counts(connection), before);
  return { status: "inspection_validation_passed", connection_setting: "DIRECT_URL", checks: checks + 1,
    fixtures_rolled_back: true, aggregate_counts_unchanged: true, private_records_printed: false };
}

export async function validateIdentityInspectionOnly(connection: Connection) {
  const before=await counts(connection);
  const extras=()=>connection`select (select count(*)::int from public.artifact) as artifacts,
    (select count(*)::int from public.source_identity) as identities,(select count(*)::int from public.encounter_object) as links,
    (select count(*)::int from public.capture_request) as requests`;
  const prior=await extras(),checks=await validateIdentityInspection(connection)+await validateSourceIdentity(connection);
  assert.deepEqual(await counts(connection),before);
  assert.deepEqual(await extras(),prior);
  return {status:"identity_inspection_validation_passed",connection_setting:"DIRECT_URL",checks:checks+2,
    fixtures_rolled_back:true,aggregate_counts_unchanged:true,real_identity_decision_submitted:false};
}

export async function validateArchiveCompatibilityOnly(connection:Connection){
  const before=await counts(connection);let checks=await validateArchiveCompatibility(connection);
  // Exercise all changed timestamp consumers and mixed ORM/direct SQL workflows.
  checks+=await validateArchive(connection);
  checks+=await validatePersonArchive(connection);
  checks+=await validateWorker(connection);
  assert.deepEqual(await counts(connection),before);
  return {status:"archive_compatibility_validation_passed",connection_setting:"DIRECT_URL",checks:checks+1,
    fixtures_rolled_back:true,aggregate_counts_unchanged:true,real_person_archived:false};
}

export async function validateNotesOnly(connection:Connection){
  const before=await counts(connection),checks=await validateNoteAuthoring(connection);
  assert.deepEqual(await counts(connection),before);
  return {status:"note_authoring_validation_passed",connection_setting:"DIRECT_URL",checks:checks+1,
    fixtures_rolled_back:true,aggregate_counts_unchanged:true,real_note_written:false};
}

export async function validateContextualWalkOnly(connection:Connection){
  const before=await counts(connection),checks=await validateContextualWalk(connection);
  assert.deepEqual(await counts(connection),before);
  return {status:"contextual_walk_validation_passed",connection_setting:"DIRECT_URL",checks:checks+1,
    fixtures_rolled_back:true,aggregate_counts_unchanged:true,provider_called:false,real_walk_action_submitted:false};
}

export async function validateWalkSessionsOnly(connection:Connection){
  const before=await counts(connection),result=await validateWalkSessions(connection);
  assert.deepEqual(await counts(connection),before);
  return {status:"walk_sessions_validation_passed",connection_setting:"DIRECT_URL",checks:result.checks+1,
    schema_mode:result.schemaMode,fixtures_rolled_back:true,aggregate_counts_unchanged:true,migration_applied:false};
}
export async function validateWalkContentionOnly(connection:Connection){
 const before=await counts(connection),checks=await validateWalkContention(connection);
 assert.deepEqual(await counts(connection),before);
 return {status:"walk_contention_validation_passed",connection_setting:"DIRECT_URL",checks:checks+1,
  actual_connections:2,fixtures_rolled_back:true,aggregate_counts_unchanged:true,real_walk_started:false};
}
export async function validateMemoryInspectionOnly(connection:Connection){
 const before=await counts(connection),checks=await validateMemoryInspection(connection);
 assert.deepEqual(await counts(connection),before);
 return {status:"memory_inspection_validation_passed",connection_setting:"DIRECT_URL",checks:checks+1,
  fixtures_rolled_back:true,aggregate_counts_unchanged:true,real_source_downloaded:false};
}

export async function validateMemoryTrailOnly(connection:Connection){
 const before=await counts(connection),checks=await validateMemoryTrail(connection);
 assert.deepEqual(await counts(connection),before);
 return {status:"memory_trail_validation_passed",connection_setting:"DIRECT_URL",checks:checks+1,
  fixtures_rolled_back:true,aggregate_counts_unchanged:true,real_application_records_modified:false};
}

export async function validateCaptureRuntimeOnly(connection:Connection){
 const before=await counts(connection);
 const [receiptsBefore]=await connection`select count(*)::int as count from public.capture_request`;
 const checks=await validateCaptureRuntime(connection);
 assert.deepEqual(await counts(connection),before);
 const [receiptsAfter]=await connection`select count(*)::int as count from public.capture_request`;
 assert.deepEqual(receiptsAfter,receiptsBefore);
 return {status:"capture_runtime_validation_passed",connection_setting:"DIRECT_URL",checks:checks+2,
  fixtures_rolled_back:true,aggregate_counts_unchanged:true,real_capture_submitted:false,real_jobs_processed:false};
}

export async function validateSourceResolutionOnly(connection:Connection){
 const before=await counts(connection);
 const extra=()=>connection`select (select count(*)::int from public.artifact) as artifacts,(select count(*)::int from public.source_identity) as identities,
  (select count(*)::int from public.encounter_object) as links,(select count(*)::int from public.capture_request) as requests`;
 const prior=await extra(),checks=await validateSourceResolution(connection);
 assert.deepEqual(await counts(connection),before);assert.deepEqual(await extra(),prior);
 return {status:"source_resolution_validation_passed",connection_setting:"DIRECT_URL",checks:checks+2,fixtures_rolled_back:true,
  aggregate_counts_unchanged:true,real_capture_submitted:false,real_jobs_processed:false};
}

export async function validateMemoryQueryOnly(connection:Connection){
  const before=await counts(connection),checks=await validateMemoryQuery(connection);
  assert.deepEqual(await counts(connection),before);
  return {status:"memory_query_validation_passed",connection_setting:"DIRECT_URL",checks:checks+1,
    fixtures_rolled_back:true,aggregate_counts_unchanged:true,provider_called:false,real_query_submitted:false};
}
export async function validatePersonCreationOnly(connection:Connection){
 const before=await counts(connection);
 const extra=()=>connection`select (select count(*)::int from public.artifact) as artifacts,
  (select count(*)::int from public.source_identity) as identities,(select count(*)::int from public.encounter_object) as links,
  (select count(*)::int from public.capture_request) as requests`;
 const prior=await extra(),result=await validatePersonCreation(connection);
 assert.deepEqual(await counts(connection),before);assert.deepEqual(await extra(),prior);
 return {status:'person_creation_validation_passed',connection_setting:'DIRECT_URL',checks:result.checks+2,schema_mode:result.schemaMode,
  fixtures_rolled_back:true,aggregate_counts_unchanged:true,migration_applied:false,real_person_created:false,real_jobs_processed:false};
}
export async function validateIdentityReassignmentOnly(connection:Connection){
 const before=await counts(connection);
 const extra=()=>connection`select (select count(*)::int from public.artifact) as artifacts,
  (select count(*)::int from public.source_identity) as identities,(select count(*)::int from public.encounter_object) as links,
  (select count(*)::int from public.capture_request) as requests`;
 const prior=await extra(),checks=await validateIdentityReassignment(connection);
 assert.deepEqual(await counts(connection),before);assert.deepEqual(await extra(),prior);
 return {status:'identity_reassignment_validation_passed',connection_setting:'DIRECT_URL',checks:checks+2,
  fixtures_rolled_back:true,aggregate_counts_unchanged:true,real_identity_decision_submitted:false,real_jobs_processed:false};
}
export async function validateProfileRelationshipsOnly(connection:Connection){
 const before=await counts(connection);
 const extra=()=>connection`select (select count(*)::int from public.relationship) as relationships,
  (select count(*)::int from public.relationship_support) as supports,(select count(*)::int from public.artifact) as artifacts`;
 const prior=await extra(),checks=await validateProfileRelationships(connection);
 assert.deepEqual(await counts(connection),before);assert.deepEqual(await extra(),prior);
 return {status:'profile_relationship_validation_passed',connection_setting:'DIRECT_URL',checks:checks+2,
  fixtures_rolled_back:true,aggregate_counts_unchanged:true,real_identity_decision_submitted:false};
}
export async function validateAuthorshipOnly(connection:Connection){
 const before=await counts(connection);
 const extra=()=>connection`select (select count(*)::int from public.relationship) as relationships,
  (select count(*)::int from public.relationship_support) as supports,(select count(*)::int from public.artifact) as artifacts`;
 const prior=await extra(),checks=await validateAuthorship(connection);
 assert.deepEqual(await counts(connection),before);assert.deepEqual(await extra(),prior);
 return {status:'authorship_validation_passed',connection_setting:'DIRECT_URL',checks:checks+2,
  fixtures_rolled_back:true,aggregate_counts_unchanged:true,real_authorship_decision_submitted:false};
}
export async function validateRelationshipRetrievalOnly(connection:Connection){
 const before=await counts(connection);
 const extra=()=>connection`select (select count(*)::int from public.relationship) as relationships,
  (select count(*)::int from public.relationship_support) as supports,(select count(*)::int from public.artifact) as artifacts`;
 const prior=await extra(),checks=await validateRelationshipRetrieval(connection);
 assert.deepEqual(await counts(connection),before);assert.deepEqual(await extra(),prior);
 return {status:'relationship_retrieval_validation_passed',connection_setting:'DIRECT_URL',checks:checks+2,
  fixtures_rolled_back:true,aggregate_counts_unchanged:true,real_jobs_processed:false};
}
export async function validateConceptAssociationsOnly(connection:Connection){
 const before=await counts(connection);
 const extra=()=>connection`select (select count(*)::int from public.relationship) as relationships,
  (select count(*)::int from public.relationship_support) as supports,(select count(*)::int from public.concept) as concepts`;
 const prior=await extra(),checks=await validateConceptAssociations(connection);
 assert.deepEqual(await counts(connection),before);assert.deepEqual(await extra(),prior);
 return {status:'concept_association_validation_passed',connection_setting:'DIRECT_URL',checks:checks+2,
  fixtures_rolled_back:true,aggregate_counts_unchanged:true,real_decision_submitted:false};
}
export async function validateConceptRetrievalOnly(connection:Connection){
 const before=await counts(connection);
 const extra=()=>connection`select (select count(*)::int from public.relationship) as relationships,
  (select count(*)::int from public.relationship_support) as supports,(select count(*)::int from public.concept) as concepts`;
 const prior=await extra(),checks=await validateConceptRetrieval(connection);
 assert.deepEqual(await counts(connection),before);assert.deepEqual(await extra(),prior);
 return {status:'concept_retrieval_validation_passed',connection_setting:'DIRECT_URL',checks:checks+2,
  fixtures_rolled_back:true,aggregate_counts_unchanged:true,real_query_submitted:false,provider_called:false};
}

export async function validateCareerOnly(connection:Connection){
 const before=await counts(connection);
 const extra=()=>connection`select (select count(*)::int from public.relationship) as relationships,
  (select count(*)::int from public.relationship_support) as supports,(select count(*)::int from public.organisation) as organisations,
  (select count(*)::int from public.education) as education,(select count(*)::int from public.role) as roles`;
 const prior=await extra(),checks=await validateCareer(connection);
 assert.deepEqual(await counts(connection),before);assert.deepEqual(await extra(),prior);
 return {status:'career_validation_passed',connection_setting:'DIRECT_URL',checks:checks+2,fixtures_rolled_back:true,aggregate_counts_unchanged:true,provider_called:false};
}

export async function validateTrajectoryOnly(connection:Connection){
 const before=await counts(connection);
 const extra=()=>connection`select (select count(*)::int from public.relationship) as relationships,
  (select count(*)::int from public.relationship_support) as supports,(select count(*)::int from public.concept) as concepts,
  (select count(*)::int from public.organisation) as organisations,(select count(*)::int from public.education) as education,(select count(*)::int from public.role) as roles`;
 const prior=await extra(),checks=await validateTrajectory(connection);
 assert.deepEqual(await counts(connection),before);assert.deepEqual(await extra(),prior);
 return {status:'trajectory_validation_passed',connection_setting:'DIRECT_URL',checks:checks+2,fixtures_rolled_back:true,aggregate_counts_unchanged:true,provider_called:false};
}
