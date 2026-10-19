import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixtureConnection,type Connection} from './fixture-connection';
import {markValidationStage} from './validation-stage';
import {saveCaptureV2} from '../../lib/capture/v2-save';
import {postgresCaptureStore} from '../../lib/capture/v2-postgres';
import {postgresAuthorshipStore} from '../../lib/relationships/authorship';
import {confirmProfileIdentity} from '../../lib/identity/confirmation';
import {postgresIdentityStore} from '../../lib/identity/postgres-confirmation';
import {rejectProfileIdentity} from '../../lib/identity/rejection';
import {postgresRejectionStore} from '../../lib/identity/postgres-rejection';
import {memoryQuery} from '../../lib/query/memory';
import {memoryLabelsInTransaction} from '../../lib/query/postgres-labels';
import {readRetrievalTransaction,postgresRetrievalReader} from '../../lib/retrieval/postgres-reader';
import {extractionProcessor} from '../../lib/processing/extraction';
import {readExtractionTransaction} from '../../lib/processing/postgres-extraction';
import {postgresJobs} from '../../lib/processing/postgres-jobs';
import {applyExtraction} from '../../lib/processing/apply-extraction';
import type {Lease} from '../../lib/processing/worker';

export async function validateRelationshipRetrieval(connection:Connection){
 markValidationStage('relationship_retrieval');let checks=0;const rollback=new Error('RELATIONSHIP_RETRIEVAL_ROLLBACK');
 const equal=(actual:unknown,expected:unknown)=>{assert.deepEqual(actual,expected);checks++;};
 const readOnly=await postgresRetrievalReader(connection).read({mode:'recall',terms:[],constraints:[]});equal(Array.isArray(readOnly),false);
 try{await connection.begin('isolation level read committed',async tx=>{
  await tx`set local statement_timeout='20s'`;await tx`set local lock_timeout='5s'`;await tx`set local idle_in_transaction_session_timeout='30s'`;
  const target=fixtureConnection(tx),one=randomUUID(),two=randomUUID(),tag=randomUUID().replaceAll('-',''),topic=`botany${tag}`;
  const name=`Relationship Ada ${tag}`,otherName=`Relationship Grace ${tag}`;
  for(const [id,label] of [[one,name],[two,otherName]])await tx`insert into public.person(id,name,profile_url)values(${id!},${label!},null)`;
  const urn=`urn:li:activity:${BigInt('0x'+tag.slice(0,14)).toString()}`;
  const body={version:2 as const,adapterId:'linkedin' as const,kind:'social_post' as const,sourceUrl:`https://www.linkedin.com/feed/update/${urn}/`,urn,
   html:`<div role="listitem" componentkey="update-card-focus-fixture"><p>${topic} 🦋 captured work</p></div>`,reasonForNoticing:null,
   extensionVersion:'fixture',clientCapturedAt:'2026-10-18T00:00:00Z'};
  const save=(change={})=>saveCaptureV2(postgresCaptureStore(target),{...body,requestId:randomUUID(),...change});
  const jobs=postgresJobs(target,applyExtraction,['parse']),processor=extractionProcessor(id=>readExtractionTransaction(tx,id));
  async function complete(snapshotId:string){
   const [job]=await tx`select id,input_fingerprint from public.processing_job where snapshot_id=${snapshotId} and state='queued' order by id desc limit 1`;
   const lease:Lease={jobId:job!.id,snapshotId,kind:'parse',inputFingerprint:job!.input_fingerprint,token:randomUUID(),expiresAt:Date.now()+120000};
   await tx`update public.processing_job set state='leased',attempts=1,lease_token=${lease.token},leased_until=clock_timestamp()+interval '120 seconds' where id=${lease.jobId}`;
   await tx`insert into public.processing_run(job_id,lease_token,input_fingerprint,outcome)values(${lease.jobId},${lease.token},${lease.inputFingerprint},'running')`;
   const parsed=await processor(lease,()=>jobs.renew(lease,120000));equal(await jobs.complete(lease,parsed.result,parsed.outcome,Date.now()),true);
  }
  const run=async(field='authored_by',value=name,terms=[topic],question=`saved posts by ${value}`,extra:{field:string;value:string}[]=[],kinds?:string[])=>
   memoryQuery(question,'2026-10-18T00:00:00Z',{planner:{plan:async()=>JSON.stringify({mode:'recall',terms,constraints:[{field,value},...extra],
    ...(kinds?{objectKinds:kinds}:{}),encounteredBetween:null,ambiguities:[],interpretation:'Fixture reviewed relationship retrieval'})},
    reader:{read:async request=>(await readRetrievalTransaction(tx,request)).output},labels:ids=>memoryLabelsInTransaction(tx,ids)});
  const post=await save();await complete(post.snapshotId);
  equal((await run()).items.length,0);equal((await run()).uncertainTotal,0);
  const store=postgresAuthorshipStore(target),request={requestId:randomUUID(),snapshotId:post.snapshotId,personId:one,decision:'confirm' as const,reason:'Owner reviewed the author; not a source quotation.'};
  const proof=await store.decide(request),matched=await run();equal(matched.state,'matches');equal(matched.items.length,1);
  const item=matched.items[0]!,artifact=item.id;equal(item.kind,'artifact');equal(item.uncertain,false);
  const support=item.evidence.find(row=>row.provenance?.relationship)!;
  equal(support.layer,'user');equal(support.filterOnly,true);equal(support.provenance!.observationId,proof.observationId);
  const authorRelationship=support.provenance!.relationship!;equal(authorRelationship.predicate,'authored_by');
  if(authorRelationship.predicate==='authored_by')equal(authorRelationship.personId,one);
  equal(support.provenance!.snapshotId,post.snapshotId);equal(support.provenance!.encounterId,post.encounterId);
  equal(item.evidence.some(row=>row.layer==='source'&&row.provenance?.representationId&&row.text.includes(topic)),true);
  equal((await run('profile_of')).items.length,0);equal((await run('authored_by',name,[])).items.length,1);
  equal((await run('authored_by',name,['only-in-a-decision'])).items.length,0);
  equal((await run('authored_by',name,[topic],'people by Ada',[],['person'])).state,'clarification');
  equal((await run('authored_by',`missing${tag}`)).state,'clarification');
  equal((await run('authored_by',name,[topic],`posts by ${otherName}`)).state,'clarification');
  const duplicate=randomUUID();await tx`insert into public.person(id,name,profile_url)values(${duplicate},${name},null)`;
  equal((await run()).state,'clarification');
  equal((await run('authored_by',`person:${one}`,[topic],`posts by person:${one}`)).items[0]!.id,artifact);
  equal((await run('authored_by',`person:${one}`,[topic],'posts by Ada')).state,'clarification');
  await tx`update public.object_ref set archived_at=now() where id=${duplicate}`;
  const coauthor=await store.decide({...request,requestId:randomUUID(),personId:two});
  equal((await run('authored_by',otherName)).items[0]!.id,artifact);
  equal((await run('authored_by',name,[topic],`posts by ${name} and ${otherName}`,[{field:'authored_by',value:otherName}])).items.length,1);
  await tx`update public.relationship set state='candidate' where from_object_id=${artifact} and to_object_id=${one} and predicate='authored_by'`;
  equal((await run()).items.length,0);equal((await run()).uncertainTotal,0);
  await tx`update public.relationship set state='active' where from_object_id=${artifact} and to_object_id=${one} and predicate='authored_by'`;
  const again=await save();await store.decide({...request,requestId:randomUUID(),snapshotId:again.snapshotId});
  await store.decide({requestId:randomUUID(),snapshotId:post.snapshotId,personId:one,decision:'reject',observationId:proof.observationId,reason:'Withdraw only the first capture.'});
  equal((await run()).items[0]!.id,artifact);equal((await run()).items[0]!.evidence.find(row=>row.provenance?.relationship)!.provenance!.snapshotId,again.snapshotId);
  await tx`update public.object_ref set archived_at=now() where id=${again.encounterId}`;
  equal((await run()).items.length,0);equal((await run('authored_by',otherName)).items.length,1);
  await store.decide({requestId:randomUUID(),snapshotId:post.snapshotId,personId:two,decision:'reject',observationId:coauthor.observationId,reason:'Withdraw co-author.'});
  equal((await run('authored_by',otherName)).items.length,0);
  markValidationStage('profile_relationship_retrieval');
  const profile=await save({kind:'profile_page',urn:null,sourceUrl:`https://www.linkedin.com/in/rel-${tag}/`,html:`<section aria-label="Primary content"><p>${topic} profile source</p></section>`});
  const identity=postgresIdentityStore(target);await confirmProfileIdentity({requestId:randomUUID(),snapshotId:profile.snapshotId,personId:one},identity);await complete(profile.snapshotId);
  const profileMatch=await run('profile_of');equal(profileMatch.items.length,1);const profileArtifact=profileMatch.items[0]!.id;
  equal(profileMatch.items[0]!.evidence.find(row=>row.provenance?.relationship)!.provenance!.relationship!.predicate,'profile_of');
  equal((await run()).items.length,0); // Profile identity never supplies post authorship.
  const conflicting=await save({kind:'profile_page',urn:null,sourceUrl:`https://www.linkedin.com/in/rel-${tag}/`,html:`<section aria-label="Primary content"><p>${topic} profile source</p></section>`});
  const conflictProof=await confirmProfileIdentity({requestId:randomUUID(),snapshotId:conflicting.snapshotId,personId:two},identity);
  await tx`update public.relationship set state='active' where from_object_id=${profileArtifact} and predicate='profile_of'`;
  equal((await run('profile_of')).items.length,0);equal((await run('profile_of',otherName,[])).items.length,0);
  await rejectProfileIdentity({requestId:randomUUID(),snapshotId:conflicting.snapshotId,observationId:conflictProof.proof.id},postgresRejectionStore(target));
  equal((await run('profile_of')).items[0]!.id,profileArtifact);
  await tx`update public.object_ref set archived_at=now() where id=${profileArtifact}`;equal((await run('profile_of')).items.length,0);
  await tx`update public.object_ref set archived_at=now() where id=${one}`;equal((await run()).state,'clarification');
  await tx`set constraints all immediate`;checks++;throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 return checks;
}
