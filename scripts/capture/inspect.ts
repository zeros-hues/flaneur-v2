import type postgres from 'postgres';
import { z } from 'zod';

/** Inspect exactly one controlled capture graph; no source HTML, credentials or unrelated Person history. */
export async function inspectCapture(connection: ReturnType<typeof postgres>, requestId: string) {
  z.uuid().parse(requestId);
  return connection.begin('isolation level repeatable read read only', async sql => {
    await sql`set local statement_timeout='10s'`;
    const [capture] = await sql`select request.id as "requestId",request.received_at as "receivedAt",
      request.encounter_id as "encounterId",s.id as "snapshotId",s.artifact_id as "artifactId",s.adapter_id as "adapterId",
      s.capture_type as "captureType",s.content_hash as "contentHash",a.type as "artifactType",
      a.embedding_model as "embeddingModel",a.item_embedding is not null as "hasEmbedding",
      case when a.item_embedding is not null then vector_dims(a.item_embedding) else null end as dimensions,
      (select count(*)::int from public.snapshot previous join public.capture_request prior on prior.snapshot_id=previous.id
        where previous.artifact_id=s.artifact_id and (prior.received_at,previous.id)<(request.received_at,s.id)) as "priorCapturesOfArtifact"
      from public.capture_request request join public.snapshot s on s.id=request.snapshot_id
      left join public.artifact a on a.id=s.artifact_id where request.id=${requestId}`;
    if (!capture) throw Object.assign(new Error('Capture not found'), { code: 'CAPTURE_NOT_FOUND' });
    const representations = await sql`select id,normalizer_version as version,text_hash as "textHash",char_length(text) as characters
      from public.snapshot_representation where snapshot_id=${capture.snapshotId} order by id limit 20`;
    const links = await sql`select x.object_id as "objectId",r.kind,x.relation from public.encounter_object x
      join public.object_ref r on r.id=x.object_id where x.encounter_id=${capture.encounterId} order by r.kind,x.object_id`;
    const observations = await sql`select o.id,o.subject_id as "subjectId",o.truth_layer as layer,o.semantic_role as role,
      o.body_text as text,o.support_status as "supportStatus",o.field_key as "fieldKey",o.origin_key as origin,o.structured_value as provenance
      from public.observation o where o.subject_id=${capture.encounterId}
        or (o.subject_id=${capture.artifactId} and o.structured_value->>'snapshotId'=${capture.snapshotId})
        or o.structured_value->>'identity_for_snapshot'=${capture.snapshotId}
        or o.structured_value->>'snapshot_id'=${capture.snapshotId}
      order by o.recorded_at,o.id limit 100`;
    const concepts = await sql`select c.id,c.label,l.source from public.concept_link l join public.concept c on c.id=l.concept_id
      where l.artifact_id=${capture.artifactId} order by c.label limit 100`;
    const relationships = await sql`select id,from_object_id as "from",to_object_id as "to",predicate,state,origin_key as origin
      from public.relationship where from_object_id=${capture.artifactId} order by id limit 100`;
    const jobs = await sql`select j.id,j.kind,j.state,j.attempts,j.max_attempts as "maxAttempts",j.last_error_code as "errorCode",
      j.available_at as "availableAt",j.input_fingerprint as "inputFingerprint",h.input_fingerprint=j.input_fingerprint as current
      from public.processing_job j left join public.processing_head h on h.scope_key=j.scope_key where j.snapshot_id=${capture.snapshotId} order by j.kind,j.id`;
    const runs = await sql`select run.id,run.job_id as "jobId",run.outcome,run.model,run.prompt_version as "promptVersion",
      run.started_at as "startedAt",run.finished_at as "finishedAt" from public.processing_run run
      join public.processing_job job on job.id=run.job_id where job.snapshot_id=${capture.snapshotId} order by run.started_at,run.id limit 100`;
    return { capture, representations, links, observations, concepts, relationships, jobs, runs };
  });
}
