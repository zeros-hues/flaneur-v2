import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { saveCaptureV2 } from "../../lib/capture/v2-save";
import { postgresCaptureStore } from "../../lib/capture/v2-postgres";
import { captureSourcePlan } from "../../lib/capture/source-plan";
import type { CaptureV2 } from "../../lib/capture/v2-contract";
import { extractionProcessor } from "../../lib/processing/extraction";
import { readExtractionTransaction } from "../../lib/processing/postgres-extraction";
import { postgresJobs } from "../../lib/processing/postgres-jobs";
import { applyExtraction } from "../../lib/processing/apply-extraction";
import { readRetrievalTransaction } from "../../lib/retrieval/postgres-reader";
import type { Lease } from "../../lib/processing/worker";
import { fixtureConnection,type Connection } from "./fixture-connection";
import { markValidationStage } from "./validation-stage";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../../db/schema";
import { processSnapshot } from "../../lib/parsers/run";
import { retrieveEvidence, verifiedExcerpt } from "../../lib/retrieval/evidence";
import { contextualCandidatesTransaction } from "../../lib/walk/postgres-contextual";
import { composeContextualWalk } from "../../lib/walk/contextual";
import { normalizeCapture } from "../../lib/retrieval/normalize";
import { memoryEvidenceExcerpt } from "../../lib/query/memory";

export async function validateSourceResolution(connection:Connection){
 markValidationStage("capture_source_resolution");let checks=0;const rollback=new Error("SOURCE_RESOLUTION_ROLLBACK");
 try{await connection.begin("isolation level read committed",async tx=>{
  await tx`set local statement_timeout = '20s'`;await tx`set local lock_timeout = '5s'`;
  const target=fixtureConnection(tx),store=postgresCaptureStore(target),tag=randomUUID();let clock=0;
  const body=(change:Partial<CaptureV2>={}):CaptureV2=>({version:2,requestId:randomUUID(),adapterId:"linkedin",kind:"profile_page",
   sourceUrl:`https://www.linkedin.com/in/source-${tag}/`,html:'<section aria-label="Primary content"><p>First exact 😀 source</p></section>',
   reasonForNoticing:"  Reason for this source 😀  ",urn:null,extensionVersion:"fixture",clientCapturedAt:"2026-10-17T00:00:00.123456Z",...change});
  const save=(input:CaptureV2)=>saveCaptureV2(store,input,()=>new Date(1792195200000+(clock++)*1000));
  const artifactId=async(snapshot:string)=>(await tx`select artifact_id from public.snapshot where id=${snapshot}`)[0]!.artifact_id as string|null;
  const firstBody=body(),first=await save(firstBody),firstArtifact=(await artifactId(first.snapshotId))!;
  assert.ok(firstArtifact);checks++;
  const [created]=await tx`select type,person_id,organisation_id,urn,body_text from public.artifact where id=${firstArtifact}`;
  assert.equal(created!.type,"profile_page");assert.equal(created!.person_id,null);assert.equal(created!.organisation_id,null);assert.equal(created!.body_text,null);checks+=4;
  const [link]=await tx`select object_id,relation from public.encounter_object where encounter_id=${first.encounterId}`;
  assert.equal(link!.object_id,firstArtifact);assert.equal(link!.relation,"source");checks+=2;
  const options={...connection.options,parsers:{...connection.options.parsers},serializers:{...connection.options.serializers}};
  const adapter=new Proxy(target,{get(client,key){return key==="options"?options:Reflect.get(client,key);}});
  const legacyDb=drizzle(adapter,{schema});
  await assert.rejects(legacyDb.transaction(legacyTx=>processSnapshot(legacyTx,{id:first.snapshotId,sourceUrl:firstBody.sourceUrl,captureType:"profile",capturedAt:new Date(firstBody.clientCapturedAt)},firstBody.html,"throw")),/VERSIONED_CAPTURE_REQUIRES_DURABLE_PROCESSOR/);checks++;
  const replay=await save(firstBody);assert.equal(replay.snapshotId,first.snapshotId);assert.equal(replay.encounterId,first.encounterId);checks+=2;
  const latestBody=body({html:'<section aria-label="Primary content"><p>Latest exact 😀 source</p></section>'}),latest=await save(latestBody);
  assert.equal(await artifactId(latest.snapshotId),firstArtifact);assert.notEqual(latest.encounterId,first.encounterId);checks+=2;
  markValidationStage("source_artifact_fenced_projection");
  const jobs=postgresJobs(target,applyExtraction,["parse"]),processor=extractionProcessor(id=>readExtractionTransaction(tx,id));
  async function complete(snapshotId:string){
   const [job]=await tx`select id,input_fingerprint from public.processing_job where snapshot_id=${snapshotId}`;
   const lease:Lease={jobId:job!.id,snapshotId,kind:"parse",inputFingerprint:job!.input_fingerprint,token:randomUUID(),expiresAt:Date.now()+120000};
   await tx`update public.processing_job set state='leased',attempts=1,lease_token=${lease.token},leased_until=clock_timestamp()+interval '120 seconds' where id=${lease.jobId}`;
   await tx`insert into public.processing_run(job_id,lease_token,input_fingerprint,outcome)values(${lease.jobId},${lease.token},${lease.inputFingerprint},'running')`;
   const parsed=await processor(lease,()=>jobs.renew(lease,120000));assert.equal(await jobs.complete(lease,parsed.result,parsed.outcome,Date.now()),true);checks++;
  }
  await complete(latest.snapshotId);await complete(first.snapshotId);
  assert.equal((await tx`select body_text from public.artifact where id=${firstArtifact}`)[0]!.body_text,'Latest exact 😀 source');checks++;
  assert.equal((await tx`select count(*)::int as n from public.snapshot_representation where snapshot_id in (${first.snapshotId},${latest.snapshotId})`)[0]!.n,2);checks++;
  const [raw]=await tx`select content_gzip from public.snapshot where id=${first.snapshotId}`;assert.equal(gunzipSync(raw!.content_gzip).toString(),firstBody.html);checks++;
  const candidate=(await readRetrievalTransaction(tx,{mode:"recall",terms:[],constraints:[]})).output.candidates.find(row=>row.id===firstArtifact)!;
  assert.ok(candidate.evidence.some(item=>item.layer==='user'&&item.text===firstBody.reasonForNoticing));checks++;
  markValidationStage("source_recall_without_notes");
  const bareBody=body({sourceUrl:`https://www.linkedin.com/in/no-note-${tag}/`,reasonForNoticing:null,
    html:'<section aria-label="Primary content"><p>Captured 😀 botanical correspondence</p></section>'});
  const bare=await save(bareBody),bareArtifact=(await artifactId(bare.snapshotId))!;
  const representation=normalizeCapture(bare.snapshotId,'profile_page',bareBody.html);
  // An immutable representation alone is insufficient: completion must be current and successful.
  await tx`insert into public.snapshot_representation(id,snapshot_id,normalizer_version,text,text_hash)
    values(${representation.id},${representation.snapshotId},${representation.normalizerVersion},${representation.text},${representation.textHash})`;
  const sources=async(connection=tx)=>(await readRetrievalTransaction(connection,{mode:'recall',terms:[],constraints:[]})).output.candidates;
  const bareSource=async(connection=tx)=>((await sources(connection)).find(row=>row.id===bareArtifact)?.evidence??[]).filter(e=>e.provenance?.representationId);
  markValidationStage("source_recall_pending_representation");
  assert.equal((await bareSource()).length,0);checks++;
  await complete(bare.snapshotId);
  markValidationStage("source_recall_completed_evidence");
  const bareCandidates=await sources(),sourceEvidence=await bareSource();
  assert.equal(sourceEvidence.length,1);checks++;
  assert.equal(sourceEvidence[0]!.layer,'source');assert.equal(sourceEvidence[0]!.verified,true);checks+=2;
  assert.equal(sourceEvidence[0]!.provenance!.snapshotId,bare.snapshotId);checks++;
  const excerpt=memoryEvidenceExcerpt(sourceEvidence[0]!,['botanical'],20);
  assert.equal(verifiedExcerpt(representation.text,excerpt.provenance!.startCodepoint!,excerpt.provenance!.endCodepoint!,excerpt.text),true);checks++;
  assert.equal(bareCandidates.find(row=>row.id===bareArtifact)!.evidence.some(e=>e.layer==='user'),false);checks++;
  assert.equal(bareCandidates.find(row=>row.id===bareArtifact)!.facts.length,0);checks++;
  const recalled=retrieveEvidence({mode:'recall',terms:['botanical'],constraints:[]},bareCandidates);
  assert.ok(recalled.matches.some(row=>row.candidate.id===bareArtifact));
  assert.ok(recalled.matches.some(row=>row.candidate.id===bare.encounterId));checks+=2;
  markValidationStage("source_recall_contextual_walk");
  const contextual=(await contextualCandidatesTransaction(tx)).filter(row=>row.id===bareArtifact);
  assert.equal(composeContextualWalk(contextual,{referenceInstant:'2026-10-17T12:00:00Z',context:'botanical'})[0]?.id,bareArtifact);checks++;
  markValidationStage("source_recall_capture_versions");
  const shared=bareCandidates.find(row=>row.id===firstArtifact)!.evidence.filter(e=>e.provenance?.representationId);
  assert.equal(shared.length,2);assert.equal(new Set(shared.map(e=>e.provenance!.snapshotId)).size,2);checks+=2;
  // Isolated synthetic mutations prove eligibility withdrawals; each savepoint rolls back independently.
  async function withdrawn(change:(inner:typeof tx)=>Promise<unknown>){
   const marker=new Error('SOURCE_ELIGIBILITY_ROLLBACK');
   try{await tx.savepoint(async inner=>{await change(inner);assert.equal((await bareSource(inner)).length,0);checks++;throw marker;});}
   catch(error){if(error!==marker)throw error;}
  }
  markValidationStage("source_recall_withdrawals");
  await withdrawn(inner=>inner`update public.processing_head set input_fingerprint=${'f'.repeat(64)} where scope_key=${`parse:snapshot:${bare.snapshotId}`}`);
  for(const state of ['queued','failed','quarantined','superseded'])
   await withdrawn(inner=>inner`update public.processing_job set state=${state} where snapshot_id=${bare.snapshotId}`);
  await withdrawn(inner=>inner`update public.object_ref set archived_at=now() where id=${bare.encounterId}`);
  await withdrawn(inner=>inner`update public.object_ref set archived_at=now() where id=${bareArtifact}`);
  await withdrawn(inner=>inner`delete from public.encounter_object where encounter_id=${bare.encounterId} and relation='source'`);
  await tx`update public.artifact set body_text='Invented display-only mycology' where id=${bareArtifact}`;
  assert.equal(retrieveEvidence({mode:'recall',terms:['mycology'],constraints:[]},[(await sources()).find(row=>row.id===bareArtifact)!]).state,'no_match');checks++;
  assert.equal((await bareSource())[0]!.text,representation.text);checks++;
  markValidationStage("source_variants_and_post_identity");
  const variant=await save(body({sourceUrl:firstBody.sourceUrl+'?section=education'}));assert.notEqual(await artifactId(variant.snapshotId),firstArtifact);checks++;
  const long=await save(body({sourceUrl:firstBody.sourceUrl+'?query='+'x'.repeat(6000)}));assert.ok(await artifactId(long.snapshotId));checks++;
  const urn=`urn:li:activity:${BigInt('0x'+tag.replaceAll('-','')).toString()}`;
  const legacyPerson=randomUUID(),legacyArtifact=randomUUID();
  await tx`insert into public.person(id,profile_url,name)values(${legacyPerson},${`https://www.linkedin.com/in/legacy-${tag}/`},'Legacy fixture')`;
  await tx`insert into public.artifact(id,type,source_url,person_id,urn,body_text)values(${legacyArtifact},'post',${`https://www.linkedin.com/feed/update/${urn}/`},${legacyPerson},${urn},'Legacy text retained')`;
  const postBody=body({kind:'social_post',sourceUrl:'https://www.linkedin.com/feed/',urn}),post=await save(postBody),postId=(await artifactId(post.snapshotId))!;
  const direct=await save({...postBody,requestId:randomUUID(),urn:null,sourceUrl:`https://www.linkedin.com/feed/update/${urn}/?tracking=fixture`});
  assert.equal(await artifactId(direct.snapshotId),postId);assert.notEqual(postId,legacyArtifact);checks+=2;
  assert.equal((await tx`select person_id from public.artifact where id=${postId}`)[0]!.person_id,null);checks++;
  assert.equal((await tx`select body_text from public.artifact where id=${legacyArtifact}`)[0]!.body_text,'Legacy text retained');checks++;
  const unknown=body({kind:'social_post',sourceUrl:'https://www.linkedin.com/feed/'}),unknownA=await save(unknown),unknownB=await save({...unknown,requestId:randomUUID()});
  assert.notEqual(await artifactId(unknownA.snapshotId),await artifactId(unknownB.snapshotId));checks++;
  const conflict=await save(body({kind:'social_post',sourceUrl:`https://www.linkedin.com/feed/update/${urn}/`,urn:'urn:li:activity:9'}));
  assert.notEqual(await artifactId(conflict.snapshotId),postId);checks++;
  markValidationStage("source_inactive_and_conflict_preserve_original");
  await tx`update public.object_ref set archived_at=now() where id=${firstArtifact}`;
  const archived=await save(body());assert.equal(await artifactId(archived.snapshotId),null);checks++;
  const [context]=await tx`select source_context from public.encounter where id=${archived.encounterId}`;
  assert.equal(context!.source_context.source_resolution.reason,'registered_source_inactive');checks++;
  assert.equal((await tx`select archived_at is not null as archived from public.object_ref where id=${firstArtifact}`)[0]!.archived,true);checks++;
  const corruptBody=body({sourceUrl:`https://www.linkedin.com/in/conflicting-${tag}/`}),corruptFirst=await save(corruptBody),corruptId=(await artifactId(corruptFirst.snapshotId))!;
  await tx`update public.artifact set source_url='https://example.test/conflicting-record' where id=${corruptId}`;
  const preserved=await save({...corruptBody,requestId:randomUUID()});assert.equal(await artifactId(preserved.snapshotId),null);checks++;
  assert.equal((await tx`select count(*)::int as n from public.relationship where from_object_id=${postId}`)[0]!.n,0);checks++;
  const aliasBody=body({sourceUrl:`https://www.linkedin.com/in/alias-${tag}/`}),aliasCapture=await save(aliasBody),former=(await artifactId(aliasCapture.snapshotId))!;
  const decision=randomUUID();
  await tx`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,support_status)
    values(${decision},${former},'user','note','Synthetic alias decision','verified')`;
  await tx`insert into public.object_alias(former_object_id,canonical_object_id,decision_observation_id)values(${former},${corruptId},${decision})`;
  assert.equal(await artifactId((await save({...aliasBody,requestId:randomUUID()})).snapshotId),null);checks++;
  const plan=captureSourcePlan(firstBody,first.snapshotId);
  assert.equal((await tx`select count(*)::int as n from public.source_identity where adapter_id='linkedin' and identity_kind=${plan.identityKind} and external_key=${plan.externalKey}`)[0]!.n,1);checks++;
  await tx`set constraints all immediate`;checks++;
  throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 return checks;
}
