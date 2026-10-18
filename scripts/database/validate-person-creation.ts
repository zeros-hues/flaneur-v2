import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fixtureConnection,type Connection} from './fixture-connection';
import {markValidationStage} from './validation-stage';
import {sourceNeutralPeople} from '../../lib/identity/creation-readiness';
import {sourceReviewTransaction} from '../../lib/identity/source-review';
import {createPersonFromProfile,type PersonCreationStore} from '../../lib/identity/creation';
import {confirmProfileIdentity} from '../../lib/identity/confirmation';
import {rejectProfileIdentity} from '../../lib/identity/rejection';
import {postgresIdentityStore} from '../../lib/identity/postgres-confirmation';
import {postgresRejectionStore} from '../../lib/identity/postgres-rejection';
import {postgresCaptureStore} from '../../lib/capture/v2-postgres';
import {saveCaptureV2} from '../../lib/capture/v2-save';
import {postgresJobs} from '../../lib/processing/postgres-jobs';
import {extractionProcessor} from '../../lib/processing/extraction';
import {readExtractionTransaction} from '../../lib/processing/postgres-extraction';
import {applyExtraction} from '../../lib/processing/apply-extraction';
import type {Lease} from '../../lib/processing/worker';
import {readRetrievalTransaction} from '../../lib/retrieval/postgres-reader';
import {exportCatalog,exportRows} from '../../lib/export/postgres-v2';
import {buildMemoryExport} from '../../lib/export/v2';

export async function validatePersonCreation(connection:Connection){
 let checks=0;markValidationStage('person_creation_proposed');
 const before=await connection.begin('isolation level repeatable read read only',async tx=>({nullable:await sourceNeutralPeople(tx)}));
 const rollback=new Error('PERSON_CREATION_ROLLBACK');
 try{await connection.begin('isolation level read committed',async tx=>{
  await tx`set local statement_timeout='20s'`;await tx`set local lock_timeout='5s'`;
  await tx`set local idle_in_transaction_session_timeout='30s'`;
  // Graph writers must finish before the proposed ALTER acquires the Person table lock.
  await tx`select pg_advisory_xact_lock(1790703955,1)`;
  const target=fixtureConnection(tx),store=postgresIdentityStore(target),tag=randomUUID(),legacyPerson=randomUUID();
  if(!before.nullable){
   assert.equal(await sourceNeutralPeople(tx),false);checks++;
   await assert.rejects(createPersonFromProfile({requestId:randomUUID(),snapshotId:randomUUID(),name:'Not ready fixture'},store),/PERSON_CREATION_NOT_READY/);checks++;
   // ALTER precedes fixture inserts: deferred registry checks must not be pending during table DDL.
   for(const statement of readFileSync('db/migrations/0017_source_neutral_people.sql','utf8').split('--> statement-breakpoint'))
    if(statement.trim())await tx.unsafe(statement);
  }
  const body={version:2 as const,requestId:randomUUID(),adapterId:'linkedin' as const,kind:'profile_page' as const,
   sourceUrl:`https://www.linkedin.com/in/create-person-${tag}/`,html:'<section aria-label="Primary content"><h1>Source fixture 😀</h1><section componentkey="EducationTopLevelSection"><a href="/school/epfl/">EPFL</a></section></section>',
   reasonForNoticing:null,urn:null,extensionVersion:'fixture',clientCapturedAt:'2026-01-01T00:00:00Z'};
  await tx`insert into public.person(id,profile_url,name)values(${legacyPerson},${body.sourceUrl},'Existing legacy person retained')`;
  const saved=await saveCaptureV2(postgresCaptureStore(target),body),request={requestId:randomUUID(),snapshotId:saved.snapshotId,name:`  Reviewed 😀 ${tag}  `};
  const read=async()=>(await sourceReviewTransaction(tx,saved.snapshotId,{})).page!;
  assert.equal(await sourceNeutralPeople(tx),true);assert.equal((await read()).canCreatePerson,true);checks+=2;
  markValidationStage('person_creation_atomic_identity');
  const created=await createPersonFromProfile(request,store),personId=created.proof.personId;
  const [person]=await tx`select name,profile_url,headline,first_captured_at from public.person where id=${personId}`;
  assert.equal(person!.name,request.name.trim());assert.equal(person!.profile_url,null);assert.equal(person!.headline,null);checks+=3;
  const [time]=await tx`select p.first_captured_at=request.received_at as trusted_time from public.person p
   join public.capture_request request on request.snapshot_id=${saved.snapshotId} where p.id=${personId}`;
  assert.equal(time!.trusted_time,true);checks++;
  const [legacy]=await tx`select name,profile_url from public.person where id=${legacyPerson}`;
  assert.equal(legacy!.name,'Existing legacy person retained');assert.equal(legacy!.profile_url,body.sourceUrl);checks+=2;
  assert.notEqual(personId,legacyPerson);checks++;
  const current=await read();assert.equal(current.canCreatePerson,false);assert.equal(current.associations[0]!.id,personId);checks+=2;
  assert.equal(current.associations[0]!.capture.proof!.layer,'user');checks++;
  assert.equal((await createPersonFromProfile(request,store)).replayed,true);checks++;
  await assert.rejects(createPersonFromProfile({...request,name:'Changed'},store),/IDENTITY_REQUEST_CONFLICT/);checks++;
  await assert.rejects(confirmProfileIdentity({requestId:request.requestId,snapshotId:saved.snapshotId,personId},store),/IDENTITY_REQUEST_CONFLICT/);checks++;
  await assert.rejects(createPersonFromProfile({...request,requestId:randomUUID()},store),/IDENTITY_REASSIGNMENT_REQUIRES_REVIEW/);checks++;
  const [count]=await tx`select count(*)::int as n from public.observation where origin_key=${`identity-confirmation:${request.requestId}`}`;
  assert.equal(count!.n,1);checks++;
  const [job]=await tx`select j.id,j.input_fingerprint from public.processing_job j join public.processing_head h
    on h.scope_key=j.scope_key and h.input_fingerprint=j.input_fingerprint where j.snapshot_id=${saved.snapshotId}`;
  const jobs=postgresJobs(target,applyExtraction,['parse']),processor=extractionProcessor(id=>readExtractionTransaction(tx,id));
  const lease:Lease={jobId:job!.id,snapshotId:saved.snapshotId,kind:'parse',inputFingerprint:job!.input_fingerprint,token:randomUUID(),expiresAt:Date.now()+120000};
  await tx`update public.processing_job set state='leased',lease_token=${lease.token},leased_until=clock_timestamp()+interval '120 seconds',attempts=1 where id=${lease.jobId}`;
  await tx`insert into public.processing_run(job_id,lease_token,input_fingerprint,outcome)values(${lease.jobId},${lease.token},${lease.inputFingerprint},'running')`;
  const output=await processor(lease,()=>jobs.renew(lease,120000));assert.equal(await jobs.complete(lease,output.result,output.outcome,Date.now()),true);checks++;
  const candidates=async()=>(await readRetrievalTransaction(tx,{mode:'recall',terms:[],constraints:[]})).output.candidates;
  assert.ok((await candidates()).find(row=>row.id===personId)!.facts.some(f=>f.field==='school'&&f.value==='EPFL'));checks++;
  const otherCapture=await saveCaptureV2(postgresCaptureStore(target),{...body,requestId:randomUUID()});
  assert.equal((await sourceReviewTransaction(tx,otherCapture.snapshotId,{})).page!.canCreatePerson,true);checks++;
  const second=await createPersonFromProfile({...request,requestId:randomUUID(),snapshotId:otherCapture.snapshotId},store);
  assert.notEqual(second.proof.personId,personId);checks++;
  assert.equal((await tx`select profile_url from public.person where id=${second.proof.personId}`)[0]!.profile_url,null);checks++;
  await assert.rejects(tx.savepoint(async inner=>{await inner`insert into public.person(id,name,profile_url)
   values(${randomUUID()},'Duplicate legacy URL fixture',${body.sourceUrl})`;}),error=>(error as {code?:string}).code==='23505');checks++;
  await assert.rejects(createPersonFromProfile({...request,snapshotId:otherCapture.snapshotId},store),/IDENTITY_REQUEST_CONFLICT/);checks++;
  markValidationStage('person_creation_queue_failure_rollback');
  const failedCapture=await saveCaptureV2(postgresCaptureStore(target),{...body,requestId:randomUUID(),sourceUrl:body.sourceUrl+'?failed-queue=fixture'});
  const failedRequest={...request,requestId:randomUUID(),snapshotId:failedCapture.snapshotId};
  const [beforeFailure]=await tx`select count(*)::int as n from public.person`;
  const failing:PersonCreationStore={transaction:(snapshotId,work)=>store.transaction(snapshotId,context=>work({...context,
   queueParse:async()=>{throw new Error('FIXTURE_CREATION_QUEUE_FAILED');}}))};
  await assert.rejects(createPersonFromProfile(failedRequest,failing),/FIXTURE_CREATION_QUEUE_FAILED/);checks++;
  assert.deepEqual((await tx`select count(*)::int as n from public.person`)[0],beforeFailure);checks++;
  const failedPage=(await sourceReviewTransaction(tx,failedCapture.snapshotId,{})).page!;
  assert.equal(failedPage.associations.length,0);assert.equal(failedPage.canCreatePerson,true);checks+=2;
  markValidationStage('person_creation_export_and_rejection');
  const catalog=await exportCatalog(tx),personTable=catalog.find(table=>table.name==='person')!;
  const exported=await buildMemoryExport({transaction:async work=>work({capturedAt:async()=>new Date().toISOString(),catalog:async()=>catalog,
   rows:table=>exportRows(tx,table,{column:table.primaryKey[0]!,value:table.name==='person'?personId:randomUUID()})})});
  assert.equal(exported.version,3);assert.equal(exported.schemaTag,'0017');checks+=2;
  const rows=exported.tables.find(table=>table.name==='person')!.rows;
  assert.equal(rows[0]![personTable.columns.findIndex(c=>c.name==='profile_url')],null);checks++;
  assert.equal(rows[0]![personTable.columns.findIndex(c=>c.name==='name')],request.name.trim());checks++;
  await rejectProfileIdentity({requestId:randomUUID(),snapshotId:saved.snapshotId,observationId:created.proof.id},postgresRejectionStore(target));
  assert.equal((await candidates()).find(row=>row.id===personId)!.facts.length,0);checks++;
  assert.equal((await read()).canCreatePerson,false);checks++;
  await tx`update public.object_ref set archived_at=now() where id=${personId}`;
  assert.equal((await createPersonFromProfile(request,store)).replayed,true);checks++;
  const unchanged=await tx`select input_fingerprint from public.processing_head where scope_key=${`parse:snapshot:${saved.snapshotId}`}`;
  await createPersonFromProfile(request,store);
  assert.deepEqual(await tx`select input_fingerprint from public.processing_head where scope_key=${`parse:snapshot:${saved.snapshotId}`}`,unchanged);checks++;
  await tx`set constraints all immediate`;checks++;
  throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 const after=await connection.begin('isolation level repeatable read read only',async tx=>({nullable:await sourceNeutralPeople(tx)}));
 assert.deepEqual(after,before);checks++;
 return {checks,schemaMode:before.nullable?'installed':'rollback_only_0017'};
}
