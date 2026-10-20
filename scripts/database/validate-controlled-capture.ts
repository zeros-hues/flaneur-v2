import { markValidationStage } from './validation-stage';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { fixtureConnection } from './fixture-connection';
import { saveCaptureV2 } from '../../lib/capture/v2-save';
import { postgresCaptureStore } from '../../lib/capture/v2-postgres';
import { runCaptureCycle } from '../processing/capture-runtime';
import { readRetrievalTransaction } from '../../lib/retrieval/postgres-reader';
import { retrieveEvidence, type Request } from '../../lib/retrieval/evidence';
import { liveCaptureProviders } from '../../lib/processing/capture-semantic';
import { postgresJobs } from '../../lib/processing/postgres-jobs';
import { enqueueInTransaction } from '../../lib/processing/enqueue';
import { gzipSync } from 'node:zlib';
import { readCaptureProgress } from '../../lib/capture/readiness-postgres';
import { captureReadiness } from '../../lib/capture/readiness';
import { inspectCapture } from '../capture/inspect';

export async function validateControlledCapture(connection: ReturnType<typeof postgres>) {
  const rollback = new Error('CONTROLLED_CAPTURE_ROLLBACK'); let checks = 0;
  const counts = () => connection`select (select count(*) from public.artifact) as artifacts,
    (select count(*) from public.snapshot) as snapshots,(select count(*) from public.encounter) as encounters,
    (select count(*) from public.observation) as observations,(select count(*) from public.processing_job) as jobs,
    (select count(*) from public.concept) as concepts,(select count(*) from public.relationship) as relationships,
    (select count(*) from public.capture_request) as requests,(select count(*) from public.processing_run) as runs,
    (select count(*) from public.concept_link) as links,(select count(*) from public.snapshot_representation) as representations,
    (select count(*) from public.source_identity) as identities,(select count(*) from public.object_ref) as refs`;
  markValidationStage('controlled_counts_before');
    const before = await counts();
  try { await connection.begin('isolation level read committed', async sql => {
    await sql`set local statement_timeout='20s'`; await sql`set local lock_timeout='5s'`;
    await sql`set local idle_in_transaction_session_timeout='45s'`;
    const target = fixtureConnection(sql), store = postgresCaptureStore(target);
    const suffix = randomUUID(), at = new Date('2099-01-01T00:00:01Z');
    const policy = { CAPTURE_V2_ENABLED: 'true', CAPTURE_V2_ACTIVATED_AT: '2099-01-01T00:00:00Z',
      CAPTURE_V2_ALLOWED_HOSTS: 'www.linkedin.com,controlled.example.test' };
    const vector = () => Array.from({ length: 768 }, (_, i) => i === 0 ? 1 : 0);
    let failDocuments = true, documentCalls = 0;
    const providers: typeof liveCaptureProviders = {
      async embed(texts, task) {
        if (task === 'RETRIEVAL_DOCUMENT') { documentCalls++;
          if (failDocuments) throw new Error('SYNTHETIC_PROVIDER_UNAVAILABLE'); }
        return texts.map(vector);
      },
      async concepts() { return [`controlled mobile rendering ${suffix}`]; },
    };
    const base = { version: 2, requestId: randomUUID(), adapterId: 'linkedin', kind: 'profile_page',
      sourceUrl: `https://www.linkedin.com/in/controlled-${suffix}/`,
      html: '<section aria-label="Primary content"><h1>Synthetic Profile</h1><p>Mechanical engineering and AI.</p></section>',
      reasonForNoticing: 'Interesting transition from mechanical engineering into AI.', urn: null,
      extensionVersion: 'controlled-fixture', clientCapturedAt: at.toISOString() };
    markValidationStage('controlled_save_profile');
    const profile = await saveCaptureV2(store, base, () => at);
    markValidationStage('controlled_save_post');
    const post = await saveCaptureV2(store, { ...base, requestId: randomUUID(), kind: 'social_post',
      sourceUrl: `https://www.linkedin.com/feed/update/urn:li:activity:${Date.now()}/`,
      html: '<div role="listitem" componentkey="update-card-focus-fixture"><p>3D mobile performance through instancing.</p></div>',
      reasonForNoticing: 'Smart approach to handling heavy 3D without killing mobile performance.' }, () => at);
    const webBody = { ...base, requestId: randomUUID(), adapterId: 'web', kind: 'article',
      sourceUrl: `https://controlled.example.test/project/${suffix}`,
      html: '<article data-flaneur-source="web"><h1>Controlled project</h1><p>Adaptive 3D rendering on mobile.</p></article>',
      reasonForNoticing: null };
    markValidationStage('controlled_save_web');
    const web = await saveCaptureV2(store, webBody, () => at);
    markValidationStage('controlled_save_duplicate');
    const duplicate = await saveCaptureV2(store, { ...webBody, requestId: randomUUID(), reasonForNoticing: 'Return to the mobile rendering project.' }, () => new Date(at.getTime() + 1));
    assert.notEqual(web.encounterId, duplicate.encounterId); checks++;
    const replay = await saveCaptureV2(store, webBody, () => at);
    assert.equal(replay.snapshotId, web.snapshotId); assert.equal(replay.replayed, true); checks += 2;
    const [sources] = await sql`select count(distinct s.artifact_id)::int as artifacts,count(*)::int as snapshots
      from public.snapshot s where s.id=any(${[web.snapshotId, duplicate.snapshotId]})`;
    assert.equal(sources!.artifacts, 1); assert.equal(sources!.snapshots, 2); checks += 2;
    const [noReview] = await sql`select count(*)::int as count from public.relationship r
      where r.from_object_id in(select artifact_id from public.snapshot where id=any(${[profile.snapshotId,post.snapshotId,web.snapshotId]}))`;
    assert.equal(noReview!.count, 0); checks++;
    const [people] = await sql`select count(*)::int as count from public.encounter_object x join public.object_ref r on r.id=x.object_id
      where x.encounter_id=any(${[profile.encounterId,post.encounterId,web.encounterId]}) and r.kind='person'`;
    assert.equal(people!.count, 0); checks++; // No guessed Person or reviewed identity.

    // An unrelated old queued job must not be claimed, modified or exhausted by the new worker.
    const oldSnapshot = randomUUID();
    await sql`insert into public.snapshot(id,capture_type,source_url,content_gzip,parser_version)
      values(${oldSnapshot},'post','https://controlled.example.test/old',${gzipSync('old fixture')},'fixture')`;
    const oldJob = await enqueueInTransaction(sql, { kind: 'parse', snapshotId: oldSnapshot, targetId: null, fingerprint: 'f'.repeat(64) });
    const options = { maxJobs: 100, maxRuntimeMs: 300000, leaseDurationMs: 300000 };
    markValidationStage('controlled_first_cycle');
    const first = await runCaptureCycle(target, policy, providers, options);
    markValidationStage('controlled_parse_results');
    assert.equal(first.parse!.counts.succeeded, 4); assert.ok(first.semantic!.counts.retry_or_failed > 0); checks += 2;
    markValidationStage('controlled_old_queue');
    const [oldState] = await sql`select state,attempts from public.processing_job where id=${oldJob}`;
    assert.deepEqual({ state: oldState!.state, attempts: oldState!.attempts }, { state: 'queued', attempts: 0 }); checks++;
    markValidationStage('controlled_retry_state');
    const [failed] = await sql`select state,attempts,last_error_code from public.processing_job where snapshot_id=${post.snapshotId} and kind='index'`;
    assert.equal(failed!.state, 'queued'); assert.equal(failed!.attempts, 1); assert.equal(failed!.last_error_code, 'PROCESSING_FAILED'); checks += 3;
    const progress = await readCaptureProgress(sql, post.snapshotId);
    assert.equal(captureReadiness(Object.fromEntries(progress!.jobs.map(job => [job.kind,job.state]))), 'Saved. Processing.'); checks++;
    const [retained] = await sql`select count(*)::int as count from public.snapshot where id=any(${[profile.snapshotId,post.snapshotId,web.snapshotId,duplicate.snapshotId]})`;
    assert.equal(retained!.count, 4); checks++;
    failDocuments = false;
    await sql`update public.processing_job set available_at=now()-interval '1 second'
      where snapshot_id=any(${[profile.snapshotId,post.snapshotId,web.snapshotId,duplicate.snapshotId]}) and state='queued'`;
    markValidationStage('controlled_recovery');
    const recovered = await runCaptureCycle(target, policy, providers, options);
    markValidationStage('controlled_recovered_results');
    assert.equal(recovered.semantic!.counts.succeeded, 3); checks++;
    const calls = documentCalls;
    markValidationStage('controlled_repeat_cycle');
    const repeated = await runCaptureCycle(target, policy, providers, options);
    assert.equal(repeated.parse!.attempted, 0); assert.equal(repeated.semantic!.attempted, 0); assert.equal(documentCalls, calls); checks += 3;
    markValidationStage('controlled_embedding_results');
    const [embedded] = await sql`select count(*)::int as count from public.artifact a
      where a.id in(select artifact_id from public.snapshot where id=any(${[profile.snapshotId,post.snapshotId,web.snapshotId]})) and a.item_embedding is not null`;
    assert.equal(embedded!.count, 3); checks++;
    const [inferences] = await sql`select count(*)::int as count from public.observation
      where structured_value->>'snapshotId'=any(${[profile.snapshotId,post.snapshotId,web.snapshotId,duplicate.snapshotId]})
        and field_key='capture_concept' and truth_layer='inferred' and support_status='partial'`;
    assert.equal(inferences!.count, 3); checks++;
    const ready = await readCaptureProgress(sql, post.snapshotId);
    assert.equal(captureReadiness(Object.fromEntries(ready!.jobs.map(job => [job.kind,job.state]))), 'Ready in memory.'); checks++;
    assert.equal((await readCaptureProgress(sql, web.snapshotId))!.newer, true); checks++;
    const graph = await inspectCapture(target, base.requestId);
    assert.equal(graph.capture.dimensions, 768); assert.equal(graph.relationships.length, 0); checks += 2;
    assert.ok(graph.observations.some(observation => observation.layer === 'user' && observation.text === base.reasonForNoticing)); checks++;
    assert.ok(graph.representations.some(representation => representation.textHash)); checks++;
    markValidationStage('controlled_retrieval');
    const request: Request = { mode: 'recall', terms: ['instancing'], constraints: [], objectKinds: ['artifact'] };
    const read = await readRetrievalTransaction(sql, request);
    const recall = retrieveEvidence(request, read.output.candidates);
    assert.ok(recall.matches.some(match => match.candidate.evidence.some(item => item.provenance?.snapshotId === post.snapshotId))); checks++;
    const [postArtifact] = await sql`select artifact_id as id from public.snapshot where id=${post.snapshotId}`;
    const candidate = read.output.candidates.find(candidate => candidate.id === postArtifact!.id)!;
    assert.ok(candidate.evidence.some(item => item.layer === 'user' && item.text === 'Smart approach to handling heavy 3D without killing mobile performance.')); checks++;
    assert.ok(candidate.evidence.some(item => item.layer === 'source' && item.provenance?.representationId)); checks++;
    assert.equal(candidate.facts.some(fact => ['educated_at','employed_by','trajectory','associated_with_concept'].includes(fact.field)), false); checks++;
    const resurfaceRequest: Request = { mode: 'resurface', terms: ['performant','3D','mobile'], constraints: [], objectKinds: ['artifact'],
      question: "I'm working on a performant 3D interaction website. What have I encountered before that might help?",
      semanticScorer: { async scoreCandidates() { return [{ id: postArtifact!.id, score: 0.95, kind: 'artifact', source: 'artifact_embedding' }]; } } };
    const resurfaced = await readRetrievalTransaction(sql, resurfaceRequest);
    assert.ok(retrieveEvidence(resurfaceRequest, resurfaced.output.candidates).matches.some(match => match.candidate.id === postArtifact!.id)); checks++;
    const [vectorCheck] = await sql`select 1-(item_embedding<=>item_embedding) as similarity from public.artifact where id=${postArtifact!.id}`;
    assert.equal(Number(vectorCheck!.similarity), 1); checks++;
    // Source-only new captures cannot acquire Person-pattern support through inferred Artifact Concepts.
    const reflection: Request = { mode: 'reflect', terms: [], constraints: [], objectKinds: ['person'] };
    await readRetrievalTransaction(sql, reflection);
    assert.ok((reflection.patternInputData ?? []).every(person => !person.reviewedConcepts?.some(concept => concept.conceptLabel.includes(suffix)))); checks++;
    // Fresh runtime instance can reclaim an expired lease; the old token cannot publish.
    markValidationStage('controlled_crash_recovery');
    const job = postgresJobs(target, async () => {}, ['parse'], [oldSnapshot]);
    const firstLease = await job.claim(Date.now(), 300000); assert.equal(firstLease!.jobId, oldJob); checks++;
    await sql`update public.processing_job set leased_until=clock_timestamp()-interval '1 second' where id=${oldJob}`;
    const replacement = await postgresJobs(target, async () => {}, ['parse'], [oldSnapshot]).claim(Date.now(), 300000);
    assert.notEqual(replacement!.token, firstLease!.token); checks++;
    assert.equal(await job.complete(firstLease!, {}, 'succeeded', Date.now()), false); checks++;
    await sql`set constraints all immediate`; checks++;
    throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; }
  markValidationStage('controlled_counts_after');
    assert.deepEqual(await counts(), before); checks++;
  return { status: 'controlled_capture_validation_passed', checks, fixtures_rolled_back: true,
    real_capture_submitted: false, real_providers_used: false, historical_queue_processed: false, aggregate_counts_unchanged: true };
}
