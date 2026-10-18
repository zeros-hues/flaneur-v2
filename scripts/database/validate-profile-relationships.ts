import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixtureConnection,type Connection} from './fixture-connection';
import {markValidationStage} from './validation-stage';
import {saveCaptureV2} from '../../lib/capture/v2-save';
import {postgresCaptureStore} from '../../lib/capture/v2-postgres';
import {confirmProfileIdentity} from '../../lib/identity/confirmation';
import {postgresIdentityStore} from '../../lib/identity/postgres-confirmation';
import {rejectProfileIdentity} from '../../lib/identity/rejection';
import {postgresRejectionStore} from '../../lib/identity/postgres-rejection';
import {reassignProfileIdentity} from '../../lib/identity/reassignment';
import {postgresIdentityReassignmentStore} from '../../lib/identity/postgres-reassignment';
import {profileRelationshipsReader,readProfileRelationshipsTransaction} from '../../lib/relationships/profile-reader';
import {migrationId} from '../../lib/migration/identity';
import {inspectPersonTransaction} from '../../lib/review/postgres-inspection';

export async function validateProfileRelationships(connection:Connection){
 markValidationStage('reviewed_profile_relationships');let checks=0;const rollback=new Error('PROFILE_RELATIONSHIP_ROLLBACK');
 assert.equal(await profileRelationshipsReader(connection)('artifact',randomUUID()),null);checks++;
 try{await connection.begin('isolation level read committed',async tx=>{
  await tx`set local statement_timeout='20s'`;await tx`set local lock_timeout='5s'`;
  const target=fixtureConnection(tx),store=postgresIdentityStore(target),reject=postgresRejectionStore(target),tag=randomUUID(),one=randomUUID(),two=randomUUID();
  for(const id of [one,two])await tx`insert into public.person(id,name,profile_url)values(${id},'Profile relationship fixture',null)`;
  const body={version:2 as const,requestId:randomUUID(),adapterId:'linkedin' as const,kind:'profile_page' as const,
   sourceUrl:`https://www.linkedin.com/in/profile-edge-${tag}/`,html:'<section aria-label="Primary content"><p>Profile fixture</p></section>',
   reasonForNoticing:null,urn:null,extensionVersion:'fixture',clientCapturedAt:'2026-10-18T00:00:00Z'};
  const save=(change={})=>saveCaptureV2(postgresCaptureStore(target),{...body,requestId:randomUUID(),...change});
  const first=await save();const [source]=await tx`select artifact_id from public.snapshot where id=${first.snapshotId}`;const artifactId=source!.artifact_id as string;
  const read=async()=> (await readProfileRelationshipsTransaction(tx,'artifact',artifactId)).page!;
  assert.equal((await read()).items.length,0);checks++;
  const request={requestId:randomUUID(),snapshotId:first.snapshotId,personId:one},proof=await confirmProfileIdentity(request,store);
  let page=await read();assert.equal(page.items.length,1);assert.equal(page.items[0]!.status,'supported');checks+=2;
  assert.equal(page.items[0]!.personId,one);assert.equal(page.items[0]!.support[0]!.proofId,proof.proof.id);checks+=2;
  assert.equal(page.items[0]!.support[0]!.snapshotId,first.snapshotId);assert.equal(page.items[0]!.support[0]!.encounterId,first.encounterId);checks+=2;
  assert.equal((await readProfileRelationshipsTransaction(tx,'person',one)).page!.items[0]!.id,page.items[0]!.id);checks++;
  const assertionId=page.items[0]!.support[0]!.assertionId;
  const [assertion]=await tx`select truth_layer,semantic_role,support_status from public.observation where id=${assertionId}`;
  assert.equal(assertion!.truth_layer,'extracted');assert.equal(assertion!.semantic_role,'relationship_assertion');assert.equal(assertion!.support_status,'partial');checks+=3;
  assert.equal((await inspectPersonTransaction(tx,artifactId,undefined,'artifact')).page!.observations.find(row=>row.id===assertionId)!.identityProof,true);checks++;
  await confirmProfileIdentity(request,store);assert.equal((await read()).items[0]!.supportCount,1);checks++;
  const second=await save(),secondRequest={requestId:randomUUID(),snapshotId:second.snapshotId,personId:one};
  const secondProof=await confirmProfileIdentity(secondRequest,store);page=await read();assert.equal(page.items.length,1);assert.equal(page.items[0]!.supportCount,2);checks+=2;
  const third=await save(),thirdProof=await confirmProfileIdentity({requestId:randomUUID(),snapshotId:third.snapshotId,personId:two},store);
  page=await read();assert.equal(page.items.length,2);assert.ok(page.items.every(row=>row.status==='conflict'));checks+=2;
  assert.ok((await tx`select state from public.relationship where from_object_id=${artifactId}`).every(row=>row.state==='candidate'));checks++;
  await rejectProfileIdentity({requestId:randomUUID(),snapshotId:third.snapshotId,observationId:thirdProof.proof.id},reject);
  page=await read();assert.equal(page.items.find(row=>row.personId===one)!.status,'supported');assert.equal(page.items.find(row=>row.personId===two)!.status,'historical');checks+=2;
  await rejectProfileIdentity({requestId:randomUUID(),snapshotId:second.snapshotId,observationId:secondProof.proof.id},reject);
  assert.equal((await read()).items.find(row=>row.personId===one)!.supportCount,1);checks++;
  const reassigned=await reassignProfileIdentity({requestId:randomUUID(),snapshotId:first.snapshotId,fromObservationId:proof.proof.id,fromPersonId:one,personId:two,reason:'Fixture corrected identity'},postgresIdentityReassignmentStore(target));
  page=await read();assert.equal(page.items.find(row=>row.personId===one)!.status,'historical');assert.equal(page.items.find(row=>row.personId===two)!.status,'supported');checks+=2;
  assert.equal(page.items.find(row=>row.personId===two)!.support[0]!.proofId,reassigned.proof.id);checks++;
  await tx`update public.object_ref set archived_at=now() where id=${first.encounterId}`;
  assert.equal((await read()).items.find(row=>row.personId===two)!.status,'historical');checks++;
  assert.equal((await tx`select count(*)::int as n from public.relationship where from_object_id=${artifactId} and predicate='authored_by'`)[0]!.n,0);checks++;
  // A legacy endpoint is retained without adoption, support attachment or activation.
  const legacyCapture=await save({sourceUrl:body.sourceUrl+'?legacy=fixture'}),[legacySource]=await tx`select artifact_id from public.snapshot where id=${legacyCapture.snapshotId}`;
  const legacyId=randomUUID();await tx`insert into public.relationship(id,from_object_id,to_object_id,predicate,state,origin_key)
   values(${legacyId},${legacySource!.artifact_id},${one},'profile_of','candidate',${`legacy-fixture:${tag}`})`;
  await confirmProfileIdentity({requestId:randomUUID(),snapshotId:legacyCapture.snapshotId,personId:one},store);
  assert.equal((await readProfileRelationshipsTransaction(tx,'artifact',legacySource!.artifact_id)).page!.items.length,0);checks++;
  assert.equal((await tx`select state from public.relationship where id=${legacyId}`)[0]!.state,'candidate');checks++;
  assert.equal((await tx`select count(*)::int as n from public.relationship_support where relationship_id=${legacyId}`)[0]!.n,0);checks++;
  // A rejected managed edge is never revived by a new valid confirmation.
  const blocked=await save({sourceUrl:body.sourceUrl+'?rejected=fixture'});await confirmProfileIdentity({requestId:randomUUID(),snapshotId:blocked.snapshotId,personId:one},store);
  const [blockedSource]=await tx`select artifact_id from public.snapshot where id=${blocked.snapshotId}`;
  const managed=(await readProfileRelationshipsTransaction(tx,'artifact',blockedSource!.artifact_id)).page!.items[0]!;
  await tx`update public.relationship set state='rejected' where id=${managed.id}`;
  await confirmProfileIdentity({requestId:randomUUID(),snapshotId:blocked.snapshotId,personId:one},store);
  assert.equal((await readProfileRelationshipsTransaction(tx,'artifact',blockedSource!.artifact_id)).page!.items[0]!.status,'rejected');checks++;
  // The endpoint cursor pages records without silently truncating their population.
  const paged=randomUUID();await tx`insert into public.person(id,name,profile_url)values(${paged},'Paging fixture',null)`;
  for(let index=0;index<21;index++){
   const id=randomUUID(),origin=`reviewed-profile-v1:${id}:${paged}`;
   await tx`insert into public.artifact(id,type,source_url,migration_key)values(${id},'profile_page',${`https://example.test/${id}`},${`capture-source-v1:${id}`})`;
   await tx`insert into public.relationship(id,from_object_id,to_object_id,predicate,state,origin_key)
    values(${migrationId(origin)},${id},${paged},'profile_of','candidate',${origin})`;
  }
  const firstPage=(await readProfileRelationshipsTransaction(tx,'person',paged)).page!;assert.equal(firstPage.items.length,20);assert.ok(firstPage.nextCursor);checks+=2;
  const next=(await readProfileRelationshipsTransaction(tx,'person',paged,firstPage.nextCursor!)).page!;
  assert.equal(next.items.length,1);assert.equal(firstPage.items.some(row=>row.id===next.items[0]!.id),false);checks+=2;
  await tx`set constraints all immediate`;checks++;
  throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 return checks;
}
