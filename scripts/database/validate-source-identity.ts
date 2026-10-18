import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {saveCaptureV2} from '../../lib/capture/v2-save';
import {postgresCaptureStore} from '../../lib/capture/v2-postgres';
import {sourceReviewTransaction,sourceReviewReader} from '../../lib/identity/source-review';
import {confirmProfileIdentity} from '../../lib/identity/confirmation';
import {rejectProfileIdentity} from '../../lib/identity/rejection';
import {postgresIdentityStore} from '../../lib/identity/postgres-confirmation';
import {postgresRejectionStore} from '../../lib/identity/postgres-rejection';
import {readRetrievalTransaction} from '../../lib/retrieval/postgres-reader';
import {readExtractionTransaction} from '../../lib/processing/postgres-extraction';
import {extractionProcessor} from '../../lib/processing/extraction';
import {postgresJobs} from '../../lib/processing/postgres-jobs';
import {applyExtraction} from '../../lib/processing/apply-extraction';
import type {Lease} from '../../lib/processing/worker';
import {fixtureConnection,type Connection} from './fixture-connection';
import {markValidationStage} from './validation-stage';

export async function validateSourceIdentity(connection:Connection){
 markValidationStage('source_first_identity');let checks=0;
 assert.equal(await sourceReviewReader(connection)(randomUUID(),{}),null);checks++;
 const rollback=new Error('SOURCE_IDENTITY_ROLLBACK');
 try{await connection.begin('isolation level read committed',async tx=>{
  await tx`set local statement_timeout='20s'`;await tx`set local lock_timeout='5s'`;
  const target=fixtureConnection(tx),tag=randomUUID(),person=randomUUID(),other=randomUUID();
  const name=`Source Identity ${tag}`;
  for(const id of [person,other])await tx`insert into public.person(id,profile_url,name)
   values(${id},${`https://www.linkedin.com/in/source-identity-${id}/`},${name})`;
  const input={version:2 as const,requestId:randomUUID(),adapterId:'linkedin' as const,kind:'profile_page' as const,
   sourceUrl:`https://www.linkedin.com/in/source-review-${tag}/`,
   html:'<section aria-label="Primary content"><h1>Unresolved fixture 😀</h1><section componentkey="EducationTopLevelSection"><a href="/school/epfl/">EPFL</a></section></section>',
   urn:null,reasonForNoticing:null,extensionVersion:'fixture',clientCapturedAt:'2026-10-17T00:00:00Z'};
  const saved=await saveCaptureV2(postgresCaptureStore(target),input),snapshotId=saved.snapshotId;
  const read=async(query:unknown={})=>(await sourceReviewTransaction(tx,snapshotId,query)).page!;
  const initial=await read();assert.equal(initial.available,true);assert.equal(initial.supported,true);checks+=2;
  assert.equal(initial.associations.length,0);assert.equal(initial.people.length,0);checks+=2;
  const choices=await read({q:tag});assert.equal(choices.people.length,2);checks++;
  assert.ok(choices.people.every(row=>row.capture.actions.confirm&&!row.capture.proof));checks++;
  assert.notEqual(choices.people[0]!.id,choices.people[1]!.id);checks++;
  const jobs=postgresJobs(target,applyExtraction,['parse']),processor=extractionProcessor(id=>readExtractionTransaction(tx,id));
  async function complete(){
   const [job]=await tx`select j.id,j.input_fingerprint from public.processing_job j join public.processing_head h
    on h.scope_key=j.scope_key and h.input_fingerprint=j.input_fingerprint where j.snapshot_id=${snapshotId}`;
   const lease:Lease={jobId:job!.id,snapshotId,kind:'parse',inputFingerprint:job!.input_fingerprint,token:randomUUID(),expiresAt:Date.now()+120000};
   await tx`update public.processing_job set state='leased',lease_token=${lease.token},leased_until=clock_timestamp()+interval '120 seconds',attempts=1 where id=${lease.jobId}`;
   await tx`insert into public.processing_run(job_id,lease_token,input_fingerprint,outcome)values(${lease.jobId},${lease.token},${lease.inputFingerprint},'running')`;
   const output=await processor(lease,()=>jobs.renew(lease,120000));
   assert.equal(await jobs.complete(lease,output.result,output.outcome,Date.now()),true);checks++;
  }
  const candidates=async()=>(await readRetrievalTransaction(tx,{mode:'recall',terms:[],constraints:[]})).output.candidates;
  await complete();
  assert.equal((await candidates()).find(row=>row.id===person)!.facts.length,0);checks++;
  const identities=postgresIdentityStore(target),rejections=postgresRejectionStore(target),request={requestId:randomUUID(),snapshotId,personId:person};
  const confirmed=await confirmProfileIdentity(request,identities);
  const associated=await read({q:tag});assert.equal(associated.associations[0]!.id,person);checks++;
  assert.equal(associated.associations[0]!.capture.proof!.id,confirmed.proof.id);checks++;
  assert.equal(associated.associations[0]!.capture.proof!.layer,'user');checks++;
  assert.equal(associated.people.find(row=>row.id===other)!.capture.actions.confirm,false);checks++;
  await assert.rejects(confirmProfileIdentity({...request,requestId:randomUUID(),personId:other},identities),/IDENTITY_REASSIGNMENT_REQUIRES_REVIEW/);checks++;
  const [linked]=await tx`select count(*)::int as n from public.encounter_object where encounter_id=${saved.encounterId} and object_id=${person} and relation='noticed'`;
  assert.equal(linked!.n,1);checks++;
  await complete();
  const after=await candidates();assert.ok(after.find(row=>row.id===person)!.facts.some(f=>f.field==='school'&&f.value==='EPFL'));checks++;
  assert.equal(after.find(row=>row.id===person)!.evidence.some(e=>e.layer==='source'&&e.provenance?.representationId),false);checks++;
  const [artifact]=await tx`select a.id,a.person_id from public.snapshot s join public.artifact a on a.id=s.artifact_id where s.id=${snapshotId}`;
  assert.equal(artifact!.person_id,null);checks++;
  const typed=await tx`select predicate,to_object_id,state from public.relationship where from_object_id=${artifact!.id} or to_object_id=${artifact!.id}`;
  assert.equal(typed.length,1);assert.equal(typed[0]!.predicate,'profile_of');assert.equal(typed[0]!.to_object_id,person);assert.equal(typed[0]!.state,'active');checks++;
  const repeated=await saveCaptureV2(postgresCaptureStore(target),{...input,requestId:randomUUID()});
  assert.equal((await sourceReviewTransaction(tx,repeated.snapshotId,{})).page!.associations.length,0);checks++;
  await rejectProfileIdentity({requestId:randomUUID(),snapshotId,observationId:confirmed.proof.id},rejections);
  assert.equal((await candidates()).find(row=>row.id===person)!.facts.length,0);checks++;
  assert.equal((await read()).associations[0]!.capture.proof,null);checks++;
  const head=await tx`select input_fingerprint from public.processing_head where scope_key=${`parse:snapshot:${snapshotId}`}`;
  assert.equal((await confirmProfileIdentity(request,identities)).replayed,true);checks++;
  assert.deepEqual(await tx`select input_fingerprint from public.processing_head where scope_key=${`parse:snapshot:${snapshotId}`}`,head);checks++;
  // Archived state/link edits affect only these fixtures and roll back before the next case.
  async function unavailable(change:(sql:typeof tx)=>Promise<unknown>){const marker=new Error('INACTIVE_CAPTURE_ROLLBACK');
   try{await tx.savepoint(async inner=>{await change(inner);
    const page=(await sourceReviewTransaction(inner,snapshotId,{q:tag})).page!;assert.equal(page.available,false);checks++;
    assert.ok(page.people.every(p=>!p.capture.actions.confirm));checks++;
    await assert.rejects(confirmProfileIdentity({...request,requestId:randomUUID()},postgresIdentityStore(fixtureConnection(inner))),/IDENTITY_CAPTURE_UNAVAILABLE/);checks++;
    throw marker;});}catch(error){if(error!==marker)throw error;}}
  await unavailable(sql=>sql`update public.object_ref set archived_at=now() where id=${saved.encounterId}`);
  await unavailable(sql=>sql`update public.object_ref set archived_at=now() where id=${artifact!.id}`);
  await unavailable(sql=>sql`delete from public.encounter_object where encounter_id=${saved.encounterId} and relation='source'`);
  markValidationStage('source_identity_literal_search_pagination');
  for(let index=0;index<21;index++)await tx`insert into public.person(id,profile_url,name)
   values(${randomUUID()},${`https://www.linkedin.com/in/paged-${randomUUID()}/`},${`Literal%_ ${tag}`})`;
  const first=await read({q:`Literal%_ ${tag}`});assert.equal(first.people.length,20);assert.ok(first.nextCursor);checks+=2;
  const second=await read({q:`Literal%_ ${tag}`,cursor:first.nextCursor});assert.equal(second.people.length,1);checks++;
  assert.equal(first.people.some(p=>p.id===second.people[0]!.id),false);checks++;
  assert.equal((await read({q:`LiteralXX ${tag}`})).people.length,0);checks++;
  await tx`update public.object_ref set archived_at=now() where id=${other}`;
  assert.equal((await read({q:tag})).people.some(p=>p.id===other),false);checks++;
  await tx`set constraints all immediate`;checks++;
  throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 return checks;
}
