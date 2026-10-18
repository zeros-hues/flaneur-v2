import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixtureConnection,type Connection} from './fixture-connection';
import {markValidationStage} from './validation-stage';
import {saveCaptureV2} from '../../lib/capture/v2-save';
import {postgresCaptureStore} from '../../lib/capture/v2-postgres';
import {confirmProfileIdentity} from '../../lib/identity/confirmation';
import {postgresIdentityStore} from '../../lib/identity/postgres-confirmation';
import {reassignProfileIdentity,type IdentityReassignmentStore} from '../../lib/identity/reassignment';
import {postgresIdentityReassignmentStore} from '../../lib/identity/postgres-reassignment';
import {rejectProfileIdentity} from '../../lib/identity/rejection';
import {postgresRejectionStore} from '../../lib/identity/postgres-rejection';
import {sourceReviewTransaction} from '../../lib/identity/source-review';
import {inspectIdentitiesTransaction} from '../../lib/identity/postgres-inspection';
import {inspectPersonTransaction} from '../../lib/review/postgres-inspection';
import {readRetrievalTransaction} from '../../lib/retrieval/postgres-reader';
import {postgresJobs} from '../../lib/processing/postgres-jobs';
import {readExtractionTransaction} from '../../lib/processing/postgres-extraction';
import {extractionProcessor} from '../../lib/processing/extraction';
import {applyExtraction} from '../../lib/processing/apply-extraction';
import {enqueueInTransaction} from '../../lib/processing/enqueue';
import type {Lease} from '../../lib/processing/worker';

export async function validateIdentityReassignment(connection:Connection){
 markValidationStage('reviewed_identity_reassignment');let checks=0;const rollback=new Error('IDENTITY_REASSIGNMENT_ROLLBACK');
 try{await connection.begin('isolation level read committed',async tx=>{
  await tx`set local statement_timeout='20s'`;await tx`set local lock_timeout='5s'`;
  const from=randomUUID(),to=randomUUID(),tag=randomUUID(),note=randomUUID(),words='  My original words 😀\n  ';
  for(const id of [from,to])await tx`insert into public.person(id,name,profile_url)values(${id},${`Reassignment ${tag}`},null)`;
  const body={version:2 as const,requestId:randomUUID(),adapterId:'linkedin' as const,kind:'profile_page' as const,
   sourceUrl:`https://www.linkedin.com/in/reassign-${tag}/`,html:'<section aria-label="Primary content"><section componentkey="EducationTopLevelSection"><a href="/school/epfl/">EPFL</a></section></section>',
   reasonForNoticing:words,urn:null,extensionVersion:'fixture',clientCapturedAt:'2026-10-18T00:00:00Z'};
  const target=fixtureConnection(tx),identity=postgresIdentityStore(target),store=postgresIdentityReassignmentStore(target);
  const saved=await saveCaptureV2(postgresCaptureStore(target),body),snapshotId=saved.snapshotId;
  const originalRequest={requestId:randomUUID(),snapshotId,personId:from},original=await confirmProfileIdentity(originalRequest,identity);
  await tx`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,support_status)
   values(${note},${from},'user','note',${words},'verified')`;
  const jobs=postgresJobs(target,applyExtraction,['parse']),processor=extractionProcessor(id=>readExtractionTransaction(tx,id));
  async function leased(){
   const [job]=await tx`select j.id,j.input_fingerprint from public.processing_job j join public.processing_head h
    on h.scope_key=j.scope_key and h.input_fingerprint=j.input_fingerprint where j.snapshot_id=${snapshotId}`;
   const lease:Lease={jobId:job!.id,snapshotId,kind:'parse',inputFingerprint:job!.input_fingerprint,token:randomUUID(),expiresAt:Date.now()+120000};
   await tx`update public.processing_job set state='leased',attempts=attempts+1,lease_token=${lease.token},leased_until=clock_timestamp()+interval '120 seconds' where id=${lease.jobId}`;
   await tx`insert into public.processing_run(job_id,lease_token,input_fingerprint,outcome)values(${lease.jobId},${lease.token},${lease.inputFingerprint},'running')`;
   const output=await processor(lease,()=>jobs.renew(lease,120000));return {lease,output};
  }
  const first=await leased();assert.equal(await jobs.complete(first.lease,first.output.result,first.output.outcome,Date.now()),true);checks++;
  const candidates=async()=>(await readRetrievalTransaction(tx,{mode:'recall',terms:[],constraints:[]})).output.candidates;
  assert.ok((await candidates()).find(row=>row.id===from)!.facts.some(f=>f.field==='school'&&f.value==='EPFL'));checks++;
  const stale=await leased();
  const indexJobs=[];for(const personId of [from,to])indexJobs.push(await enqueueInTransaction(tx,{snapshotId,targetId:personId,kind:'index',fingerprint:'c'.repeat(64)}));
  const before=(await sourceReviewTransaction(tx,snapshotId,{q:tag})).page!;
  assert.equal(before.reassignment!.fromObservationId,original.proof.id);checks++;
  const [originalText]=await tx`select body_text from public.observation where id=${original.proof.id}`;
  const [sourceBefore]=await tx`select artifact_id,content_hash,content_gzip from public.snapshot where id=${snapshotId}`;
  const request={requestId:randomUUID(),snapshotId,fromObservationId:original.proof.id,fromPersonId:from,personId:to,reason:'  Correct the profile association 😀\n  '};
  const reassigned=await reassignProfileIdentity(request,store);assert.equal(reassigned.replayed,false);checks++;
  const [review]=await tx`select decision,comment from public.observation_review where observation_id=${original.proof.id}`;
  assert.equal(review!.decision,'rejected');assert.equal(review!.comment,request.reason);checks+=2;
  assert.deepEqual((await tx`select body_text from public.observation where id=${original.proof.id}`)[0],originalText);checks++;
  const [current]=await tx`select subject_id,supersedes_id,structured_value from public.observation where id=${reassigned.proof.id}`;
  assert.equal(current!.subject_id,to);assert.equal(current!.supersedes_id,null);assert.deepEqual(current!.structured_value.identity_reassignment,request);checks+=3;
  const links=await tx`select object_id from public.encounter_object where encounter_id=${saved.encounterId} and relation='noticed'`;
  assert.deepEqual(links.map(row=>row.object_id),[to]);checks++;
  assert.deepEqual((await tx`select artifact_id,content_hash,content_gzip from public.snapshot where id=${snapshotId}`)[0],sourceBefore);checks++;
  assert.equal((await tx`select count(*)::int as n from public.encounter_object where encounter_id=${saved.encounterId} and relation='source'`)[0]!.n,1);checks++;
  assert.ok((await candidates()).find(row=>row.id===from)!.evidence.some(e=>e.text===words&&e.layer==='user'));checks++;
  assert.equal((await candidates()).find(row=>row.id===from)!.facts.length,0);assert.equal((await candidates()).find(row=>row.id===to)!.facts.length,0);checks+=2;
  assert.equal(await jobs.complete(stale.lease,stale.output.result,stale.output.outcome,Date.now()),false);checks++;
  assert.ok((await tx`select state from public.processing_job where id=any(${indexJobs})`).every(row=>row.state==='superseded'));checks++;
  const newWork=await leased();assert.equal(await jobs.complete(newWork.lease,newWork.output.result,newWork.output.outcome,Date.now()),true);checks++;
  assert.ok((await candidates()).find(row=>row.id===to)!.facts.some(f=>f.field==='school'&&f.value==='EPFL'));checks++;
  const newPage=(await sourceReviewTransaction(tx,snapshotId,{})).page!;
  assert.equal(newPage.associations[0]!.id,to);assert.equal(newPage.associations[0]!.capture.proof!.reassignment!.reason,request.reason);checks+=2;
  const oldHistory=(await inspectIdentitiesTransaction(tx,from)).page!;
  assert.ok(oldHistory.captures.some(row=>row.snapshotId===snapshotId));checks++;
  const oldObservations=(await inspectPersonTransaction(tx,from)).page!;
  assert.ok(oldObservations.observations.find(row=>row.id===original.proof.id)!.reviews.some(row=>row.comment===request.reason));checks++;
  assert.equal((await reassignProfileIdentity(request,store)).replayed,true);checks++;
  await assert.rejects(reassignProfileIdentity({...request,reason:'changed'},store),/IDENTITY_REQUEST_CONFLICT/);checks++;
  await assert.rejects(reassignProfileIdentity({...request,requestId:randomUUID()},store),/IDENTITY_REVIEW_STALE_OR_AMBIGUOUS/);checks++;
  await assert.rejects(confirmProfileIdentity({requestId:request.requestId,snapshotId,personId:to},identity),/IDENTITY_REQUEST_CONFLICT/);checks++;
  const head=()=>tx`select input_fingerprint from public.processing_head where scope_key=${`parse:snapshot:${snapshotId}`}`;
  const held=await head();await confirmProfileIdentity(originalRequest,identity);assert.deepEqual(await head(),held);checks++;
  markValidationStage('reassignment_rollback_and_stale_guards');
  const back={...request,requestId:randomUUID(),fromObservationId:reassigned.proof.id,fromPersonId:to,personId:from};
  const failed:IdentityReassignmentStore={transaction:(id,people,work)=>store.transaction(id,people,context=>work({...context,queueParse:async()=>{throw new Error('FIXTURE_REASSIGNMENT_QUEUE_FAILED');}}))};
  await assert.rejects(reassignProfileIdentity(back,failed),/FIXTURE_REASSIGNMENT_QUEUE_FAILED/);checks++;
  assert.equal((await sourceReviewTransaction(tx,snapshotId,{})).page!.reassignment!.fromObservationId,reassigned.proof.id);assert.deepEqual(await head(),held);checks+=2;
  async function refuse(change:(sql:typeof tx)=>Promise<unknown>,code:string){const marker=new Error('REASSIGNMENT_GUARD_ROLLBACK');
   try{await tx.savepoint(async inner=>{await change(inner);await assert.rejects(reassignProfileIdentity({...back,requestId:randomUUID()},postgresIdentityReassignmentStore(fixtureConnection(inner))),new RegExp(code));checks++;throw marker;});}
   catch(error){if(error!==marker)throw error;}}
  await refuse(sql=>sql`update public.object_ref set archived_at=now() where id=${saved.encounterId}`,'IDENTITY_CAPTURE_UNAVAILABLE');
  await refuse(sql=>sql`update public.object_ref set archived_at=now() where id=${from}`,'IDENTITY_PERSON_UNAVAILABLE');
  await refuse(sql=>sql`insert into public.encounter_object(encounter_id,object_id,relation)values(${saved.encounterId},${from},'noticed')`,'IDENTITY_REVIEW_STALE_OR_AMBIGUOUS');
  await rejectProfileIdentity({requestId:randomUUID(),snapshotId,observationId:reassigned.proof.id},postgresRejectionStore(target));
  const rejectedHead=await head();assert.equal((await reassignProfileIdentity(request,store)).replayed,true);assert.deepEqual(await head(),rejectedHead);checks+=2;
  assert.equal((await sourceReviewTransaction(tx,snapshotId,{})).page!.reassignment,null);checks++;
  assert.equal((await candidates()).find(row=>row.id===to)!.facts.length,0);checks++;
  assert.equal((await tx`select body_text from public.observation where id=${note}`)[0]!.body_text,words);checks++;
  assert.equal((await tx`select count(*)::int as n from public.object_alias where former_object_id in(${from},${to})`)[0]!.n,0);checks++;
  await tx`set constraints all immediate`;checks++;
  throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 return checks;
}
