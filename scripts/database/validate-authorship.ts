import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixtureConnection,type Connection} from './fixture-connection';
import {markValidationStage} from './validation-stage';
import {saveCaptureV2} from '../../lib/capture/v2-save';
import {postgresCaptureStore} from '../../lib/capture/v2-postgres';
import {postgresAuthorshipStore,authorshipCapture} from '../../lib/relationships/authorship';
import {authorshipReviewTransaction,authorshipReviewReader} from '../../lib/relationships/authorship-reader';
import {inspectPersonTransaction} from '../../lib/review/postgres-inspection';
import {postgresReviewStore} from '../../lib/review/postgres-rejection';
import {rejectObservation} from '../../lib/review/rejection';
import {correctObservation} from '../../lib/review/correction';
import {confirmObservation} from '../../lib/review/confirmation';
import {archiveObservation} from '../../lib/review/archive';
import {postgresArchiveStore} from '../../lib/review/postgres-archive';
import {authorshipPanelTransaction,authorshipPanelReader} from '../../lib/relationships/authorship-panels';
import {authorshipOrigin} from '../../lib/relationships/authorship';
import {migrationId} from '../../lib/migration/identity';

export async function validateAuthorship(connection:Connection){
 markValidationStage('reviewed_post_authorship');let checks=0;const rollback=new Error('AUTHORSHIP_ROLLBACK');
 const equal=(actual:unknown,expected:unknown)=>{assert.deepEqual(actual,expected);checks++;};
 equal(await authorshipReviewReader(connection)(randomUUID(),{}),null);
 equal(await authorshipPanelReader(connection)('person',randomUUID()),null);
 equal(await authorshipPanelReader(connection)('artifact',randomUUID()),null);
 try{await connection.begin('isolation level read committed',async tx=>{
  await tx`set local statement_timeout='20s'`;await tx`set local lock_timeout='5s'`;
  await tx`set local idle_in_transaction_session_timeout='30s'`;
  const target=fixtureConnection(tx),store=postgresAuthorshipStore(target),tag=randomUUID(),one=randomUUID(),two=randomUUID();
  for(const id of [one,two])await tx`insert into public.person(id,name,profile_url)values(${id},${`Authorship ${tag}`},null)`;
  const urn=`urn:li:activity:${BigInt('0x'+tag.replaceAll('-','').slice(0,14)).toString()}`;
  const body={version:2 as const,adapterId:'linkedin' as const,kind:'social_post' as const,
   sourceUrl:`https://www.linkedin.com/feed/update/${urn}/`,urn,html:'<article>Saved authored work fixture</article>',
   reasonForNoticing:null,extensionVersion:'fixture',clientCapturedAt:'2026-10-18T00:00:00Z'};
  const save=(change={})=>saveCaptureV2(postgresCaptureStore(target),{...body,requestId:randomUUID(),...change});
  const first=await save(),second=await save(),capture=(await authorshipCapture(tx,first.snapshotId))!;
  const read=async(id=first.snapshotId,q:unknown={})=>(await authorshipReviewTransaction(tx,id,q)).page!;
  const panel=async(kind:'person'|'artifact'='artifact',id=capture.artifactId,query:unknown={})=>(await authorshipPanelTransaction(tx,kind,id,query)).page!;
  equal((await panel()).items,[]);
  equal((await read()).assertions,[]);equal((await read()).people,[]);
  equal((await read(first.snapshotId,{q:tag})).people.length,2);
  equal((await read(first.snapshotId,{q:'%_'})).people.length,0);
  const [parseBefore]=await tx`select input_fingerprint from public.processing_head where scope_key=${`parse:snapshot:${first.snapshotId}`}`;
  const request={requestId:randomUUID(),snapshotId:first.snapshotId,personId:one,decision:'confirm' as const,reason:'  Owner reviewed the post.\nExact words remain.  '};
  const proof=await store.decide(request);equal(proof.replayed,false);
  let page=await read();equal(page.assertions.length,1);equal(page.assertions[0]!.status,'owner-confirmed');
  equal(page.assertions[0]!.reason,request.reason);equal(page.assertions[0]!.encounterId,first.encounterId);
  equal(page.assertions[0]!.canReject,true);equal((await read(second.snapshotId)).assertions[0]!.canReject,false);
  markValidationStage('authorship_panel_initial');
  let authors=await panel();equal(authors.items.length,1);equal(authors.items[0]!.status,'owner-confirmed');
  equal(authors.items[0]!.supportCount,1);equal(authors.items[0]!.history[0]!.reason,request.reason);
  equal(authors.items[0]!.history[0]!.snapshotId,first.snapshotId);equal(authors.items[0]!.history[0]!.encounterId,first.encounterId);
  equal((await panel('person',one)).items[0]!.id,authors.items[0]!.id);
  equal((await store.decide(request)).replayed,true);equal((await read()).assertions.length,1);
  await assert.rejects(store.decide({...request,reason:'changed'}),/AUTHORSHIP_REQUEST_CONFLICT/);checks++;
  await assert.rejects(store.decide({...request,requestId:randomUUID()}),/AUTHORSHIP_STALE/);checks++;
  equal((await tx`select count(*)::int as n from public.encounter_object where encounter_id=${first.encounterId} and object_id=${one}`)[0]!.n,0);
  equal((await tx`select count(*)::int as n from public.observation where subject_id=${one}`)[0]!.n,0);
  const inspected=(await inspectPersonTransaction(tx,capture.artifactId,undefined,'artifact')).page!.observations.find(row=>row.id===proof.observationId)!;
  equal(inspected.identityProof,true);equal(Object.values(inspected.actions).some(Boolean),false);
  const generic=postgresReviewStore(target),genericInput={requestId:randomUUID(),observationId:proof.observationId};
  for(const action of [()=>rejectObservation(genericInput,generic),()=>confirmObservation(genericInput,generic),
   ()=>correctObservation({...genericInput,bodyText:'attempt bypass'},generic),()=>archiveObservation(genericInput,postgresArchiveStore(target))]){
   await assert.rejects(action,/IDENTITY_REVIEW_REQUIRED/);checks++;
  }
  markValidationStage('authorship_panel_multi_capture');
  const another=await store.decide({...request,requestId:randomUUID(),snapshotId:second.snapshotId});
  const coauthor=await store.decide({...request,requestId:randomUUID(),personId:two});
  equal((await read()).assertions.filter(row=>row.status==='owner-confirmed').length,3);
  equal((await tx`select count(*)::int as n from public.relationship where from_object_id=${capture.artifactId} and predicate='authored_by'`)[0]!.n,2);
  authors=await panel();equal(authors.items.length,2);equal(authors.items.find(row=>row.personId===one)!.supportCount,2);
  equal((await panel('person',one)).items.length,1);
  const dependent=randomUUID(),dependentEdge=randomUUID(),derivedJob=randomUUID(),scope=`index:object:${one}`,fingerprint='a'.repeat(64);
  await tx`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,structured_value,support_status,origin_key)
   values(${dependent},${capture.artifactId},'extracted','relationship_assertion','Derived fixture only.',
    ${tx.json({to_object_id:second.encounterId})},'partial',${`authorship-derived-fixture:${tag}`})`;
  await tx`insert into public.observation_evidence(observation_id,supporting_observation_id,support_role,evidence_version)
   values(${dependent},${proof.observationId},'supports','fixture')`;
  await tx`insert into public.relationship(id,from_object_id,to_object_id,predicate,state,origin_key)
   values(${dependentEdge},${capture.artifactId},${second.encounterId},'relevant_to','candidate',${`authorship-derived-edge:${tag}`})`;
  await tx`insert into public.relationship_support(relationship_id,observation_id)values(${dependentEdge},${dependent})`;
  await tx`update public.relationship set state='active' where id=${dependentEdge}`;
  await tx`insert into public.processing_head(scope_key,input_fingerprint)values(${scope},${fingerprint})`;
  await tx`insert into public.processing_job(id,snapshot_id,target_id,kind,scope_key,input_fingerprint)
   values(${derivedJob},${first.snapshotId},${one},'index',${scope},${fingerprint})`;
  markValidationStage('authorship_panel_withdrawal');
  const reject={requestId:randomUUID(),snapshotId:first.snapshotId,personId:one,decision:'reject' as const,observationId:proof.observationId,reason:'Withdraw only this capture decision.'};
  await assert.rejects(store.decide({...reject,observationId:coauthor.observationId}),/AUTHORSHIP_STALE/);checks++;
  await assert.rejects(store.decide({...reject,requestId:request.requestId}),/AUTHORSHIP_REQUEST_CONFLICT/);checks++;
  equal((await store.decide(reject)).replayed,false);equal((await store.decide(reject)).replayed,true);
  equal((await tx`select state from public.relationship where id=${dependentEdge}`)[0]!.state,'candidate');
  equal((await tx`select state from public.processing_job where id=${derivedJob}`)[0]!.state,'superseded');
  equal((await tx`select input_fingerprint from public.processing_head where scope_key=${scope}`)[0]!.input_fingerprint===fingerprint,false);
  equal((await inspectPersonTransaction(tx,capture.artifactId,undefined,'artifact')).page!.observations.find(row=>row.id===dependent)!.active,false);
  await assert.rejects(store.decide({...reject,reason:'changed'}),/AUTHORSHIP_REQUEST_CONFLICT/);checks++;
  page=await read();equal(page.assertions.find(row=>row.id===proof.observationId)!.status,'historical');
  equal(page.assertions.find(row=>row.id===proof.observationId)!.withdrawalReason,reject.reason);
  const retained=(await panel()).items.find(row=>row.personId===one)!;equal(retained.status,'owner-confirmed');
  equal(retained.supportCount,1);equal(retained.historyCount,2);
  equal(retained.history.find(row=>row.id===proof.observationId)!.withdrawalReason,reject.reason);
  equal(page.assertions.find(row=>row.id===another.observationId)!.status,'owner-confirmed');
  equal((await store.decide(request)).replayed,true);equal((await read()).assertions.find(row=>row.id===proof.observationId)!.current,false);
  await store.decide({...reject,requestId:randomUUID(),snapshotId:second.snapshotId,observationId:another.observationId});
  equal((await read()).assertions.filter(row=>row.personId===one&&row.status==='owner-confirmed').length,0);
  equal((await panel('person',one)).items[0]!.status,'historical');equal((await panel('person',one)).items[0]!.supportCount,0);
  equal((await read()).assertions.find(row=>row.id===coauthor.observationId)!.status,'owner-confirmed');
  // New explicit confirmation after withdrawal appends history; the old receipt cannot do so.
  markValidationStage('authorship_panel_inactive');
  const renewed=await store.decide({...request,requestId:randomUUID()});equal(renewed.observationId===proof.observationId,false);
  await tx`update public.object_ref set archived_at=now() where id=${first.encounterId}`;
  equal((await read()).available,false);equal((await read()).assertions.find(row=>row.id===renewed.observationId)!.status,'historical');
  equal((await panel()).items.find(row=>row.personId===one)!.status,'historical');
  await assert.rejects(store.decide({...request,requestId:randomUUID(),personId:two}),/AUTHORSHIP_TARGET_UNAVAILABLE/);checks++;
  equal((await store.decide(request)).replayed,true);
  await tx`update public.object_ref set archived_at=null where id=${first.encounterId}`;
  await tx`update public.object_ref set archived_at=now() where id=${two}`;
  equal((await read()).assertions.find(row=>row.id===coauthor.observationId)!.status,'historical');
  equal((await panel('person',two)).items[0]!.status,'historical');
  await assert.rejects(store.decide({...request,requestId:randomUUID(),snapshotId:second.snapshotId,personId:two}),/AUTHORSHIP_TARGET_UNAVAILABLE/);checks++;
  const profile=await save({kind:'profile_page',sourceUrl:`https://www.linkedin.com/in/${tag}/`,urn:null});
  equal((await read(profile.snapshotId)).supported,false);
  await assert.rejects(store.decide({...request,requestId:randomUUID(),snapshotId:profile.snapshotId}),/AUTHORSHIP_TARGET_UNAVAILABLE/);checks++;
  const legacy=await save({urn:null,sourceUrl:'https://www.linkedin.com/feed/'}),legacySource=(await authorshipCapture(tx,legacy.snapshotId))!;
  const legacyEdge=randomUUID();await tx`insert into public.relationship(id,from_object_id,to_object_id,predicate,state,origin_key)
   values(${legacyEdge},${legacySource.artifactId},${one},'authored_by','candidate',${`legacy:${tag}`})`;
  await assert.rejects(store.decide({...request,requestId:randomUUID(),snapshotId:legacy.snapshotId}),/AUTHORSHIP_TARGET_UNAVAILABLE/);checks++;
  equal((await tx`select count(*)::int as n from public.relationship_support where relationship_id=${legacyEdge}`)[0]!.n,0);
  equal((await panel('artifact',legacySource.artifactId)).items,[]);
  await tx`update public.relationship set state='rejected' where from_object_id=${capture.artifactId} and to_object_id=${one} and predicate='authored_by'`;
  await assert.rejects(store.decide({...request,requestId:randomUUID(),snapshotId:second.snapshotId}),/AUTHORSHIP_TARGET_UNAVAILABLE/);checks++;
  equal((await read()).assertions.find(row=>row.id===renewed.observationId)!.status,'rejected');
  const rejected=(await panel('person',one)).items[0]!;equal(rejected.status,'rejected');equal(rejected.supportCount,0);
  equal(rejected.history.some(row=>row.current),false);
  equal((await tx`select input_fingerprint from public.processing_head where scope_key=${`parse:snapshot:${first.snapshotId}`}`)[0]!.input_fingerprint,parseBefore!.input_fingerprint);
  equal((await tx`select count(*)::int as n from public.observation where field_key='identity_for_snapshot' and structured_value->>'identity_for_snapshot'=${first.snapshotId}`)[0]!.n,0);
  // Edge pages remain complete without adopting legacy endpoints or trusting namespace-shaped IDs.
  markValidationStage('authorship_panel_paging');
  const paged=randomUUID();await tx`insert into public.person(id,name,profile_url)values(${paged},'Authorship paging fixture',null)`;
  for(let index=0;index<21;index++){
   const artifact=randomUUID(),origin=authorshipOrigin(artifact,paged);
   await tx`insert into public.artifact(id,type,source_url,migration_key)values(${artifact},'social_post',${`https://example.test/authorship/${artifact}`},${`authorship-page-fixture:${artifact}`})`;
   await tx`insert into public.relationship(id,from_object_id,to_object_id,predicate,state,origin_key)
    values(${migrationId(origin)},${artifact},${paged},'authored_by','candidate',${origin})`;
  }
  const firstPage=await panel('person',paged);equal(firstPage.items.length,20);equal(!!firstPage.nextCursor,true);
  equal(firstPage.items.every(row=>row.status==='historical'&&row.supportCount===0),true);
  const nextPage=await panel('person',paged,{cursor:firstPage.nextCursor});equal(nextPage.items.length,1);equal(nextPage.nextCursor,null);
  equal(firstPage.items.some(row=>row.id===nextPage.items[0]!.id),false);
  const invalidArtifact=randomUUID();await tx`insert into public.artifact(id,type,source_url)values(${invalidArtifact},'social_post',${`https://example.test/authorship/${invalidArtifact}`})`;
  await tx`insert into public.relationship(id,from_object_id,to_object_id,predicate,state,origin_key)
   values(${randomUUID()},${invalidArtifact},${paged},'authored_by','candidate',${authorshipOrigin(invalidArtifact,paged)})`;
  await assert.rejects(panel('artifact',invalidArtifact),/AUTHORSHIP_PANEL_CONFLICT/);checks++;
  await tx`set constraints all immediate`;checks++;
  throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 return checks;
}
