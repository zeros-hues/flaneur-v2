import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixtureConnection,type Connection} from './fixture-connection';
import {markValidationStage} from './validation-stage';
import {postgresConceptAssociationStore,conceptAssociationOrigin} from '../../lib/relationships/concept-association';
import {conceptPanelTransaction,conceptPanelReader} from '../../lib/relationships/concept-reader';
import {migrationId} from '../../lib/migration/identity';
import {canonical} from '../../lib/migration/batch';
import {inspectPersonTransaction} from '../../lib/review/postgres-inspection';
import {postgresReviewStore} from '../../lib/review/postgres-rejection';
import {postgresArchiveStore} from '../../lib/review/postgres-archive';
import {confirmObservation} from '../../lib/review/confirmation';
import {correctObservation} from '../../lib/review/correction';
import {rejectObservation} from '../../lib/review/rejection';
import {archiveObservation} from '../../lib/review/archive';
import {readRetrievalTransaction} from '../../lib/retrieval/postgres-reader';

export async function validateConceptAssociations(connection:Connection){
 markValidationStage('concept_association_initial');let checks=0;const rollback=new Error('CONCEPT_ASSOCIATION_ROLLBACK');
 const equal=(actual:unknown,expected:unknown)=>{assert.deepEqual(actual,expected);checks++;};
 equal(await conceptPanelReader(connection)('concept',randomUUID()),null);
 try{await connection.begin('isolation level read committed',async tx=>{
  await tx`set local statement_timeout='20s'`;await tx`set local lock_timeout='5s'`;await tx`set local idle_in_transaction_session_timeout='30s'`;
  const target=fixtureConnection(tx),store=postgresConceptAssociationStore(target),person=randomUUID(),artifact=randomUUID(),concept=randomUUID(),tag=randomUUID();
  const label=`Correspondence ${tag}`,reason=`  Interpretation ${tag}\nExact User words 🦋  `;
  await tx`insert into public.person(id,name,profile_url)values(${person},'Concept relationship fixture',null)`;
  await tx`insert into public.artifact(id,type,source_url)values(${artifact},'social_post',${`https://example.test/${tag}`})`;
  await tx`insert into public.concept(id,label,kind)values(${concept},${label},'concept')`;
  const panel=async(kind:'person'|'artifact'|'concept'='person',id=person,query:unknown={})=>(await conceptPanelTransaction(tx,kind,id,query)).page!;
  equal((await panel()).items.length,0);equal((await panel()).concepts.length,0);
  equal((await panel('person',person,{q:tag})).concepts[0]!.id,concept);equal((await panel('person',person,{q:'%_'})).concepts.length,0);
  const input={requestId:randomUUID(),subjectId:person,conceptId:concept,decision:'confirm' as const,expectedConcept:{label,kind:'concept' as const},reason};
  await assert.rejects(store.decide({...input,requestId:randomUUID(),subjectId:concept}),/CONCEPT_ASSOCIATION_TARGET_UNAVAILABLE/);checks++;
  await assert.rejects(store.decide({...input,requestId:randomUUID(),conceptId:person}),/CONCEPT_ASSOCIATION_TARGET_UNAVAILABLE/);checks++;
  await assert.rejects(store.decide({...input,expectedConcept:{label:'stale label',kind:'concept'}}),/CONCEPT_ASSOCIATION_STALE/);checks++;
  const proof=await store.decide(input);equal(proof.replayed,false);
  let page=await panel();equal(page.items.length,1);equal(page.items[0]!.status,'owner-reviewed');equal(page.items[0]!.history[0]!.reason,reason);
  equal(page.items[0]!.history[0]!.conceptAtDecision,input.expectedConcept);equal((await panel('concept',concept)).items[0]!.id,page.items[0]!.id);
  equal((await store.decide(input)).replayed,true);await assert.rejects(store.decide({...input,reason:'changed'}),/CONCEPT_ASSOCIATION_REQUEST_CONFLICT/);checks++;
  await assert.rejects(store.decide({...input,requestId:randomUUID()}),/CONCEPT_ASSOCIATION_STALE/);checks++;
  const inspected=(await inspectPersonTransaction(tx,person)).page!.observations.find(row=>row.id===proof.observationId)!;
  equal(inspected.relationshipReview,true);equal(inspected.identityProof,false);equal(Object.values(inspected.actions).some(Boolean),false);
  const generic=postgresReviewStore(target),review={requestId:randomUUID(),observationId:proof.observationId};
  for(const action of [()=>confirmObservation(review,generic),()=>correctObservation({...review,bodyText:'bypass'},generic),()=>rejectObservation(review,generic),()=>archiveObservation(review,postgresArchiveStore(target))]){
   await assert.rejects(action,/RELATIONSHIP_REVIEW_REQUIRED/);checks++;
  }
  const artifactProof=await store.decide({...input,requestId:randomUUID(),subjectId:artifact});equal((await panel('concept',concept)).items.length,2);
  equal((await panel('artifact',artifact)).items[0]!.subjectKind,'artifact');
  equal((await tx`select count(*)::int as n from public.concept_link where concept_id=${concept}`)[0]!.n,0);
  equal((await tx`select count(*)::int as n from public.relationship where from_object_id=${artifact} and predicate='mentions_concept'`)[0]!.n,0);
  // A dependent assertion/edge and queued index job are invalidated by withdrawal.
  markValidationStage('concept_association_withdrawal');
  const dependent=randomUUID(),dependentEdge=randomUUID(),scope=`index:object:${person}`,job=randomUUID(),snapshot=randomUUID(),fingerprint='b'.repeat(64);
  const otherConcept=randomUUID();await tx`insert into public.concept(id,label,kind)values(${otherConcept},'Other fixture idea','topic')`;
  await tx`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,structured_value,support_status)
   values(${dependent},${person},'extracted','relationship_assertion','Derived fixture.',${tx.json({to_object_id:otherConcept})},'partial')`;
  await tx`insert into public.observation_evidence(observation_id,supporting_observation_id,support_role,evidence_version)values(${dependent},${proof.observationId},'supports','fixture')`;
  // A separate Concept target avoids adopting the managed association endpoint.
  await tx`insert into public.relationship(id,from_object_id,to_object_id,predicate,state,origin_key)values(${dependentEdge},${person},${otherConcept},'associated_with_concept','candidate',${`fixture-dependent:${tag}`})`;
  await tx`insert into public.relationship_support(relationship_id,observation_id)values(${dependentEdge},${dependent})`;
  await tx`update public.relationship set state='active' where id=${dependentEdge}`;
  await tx`insert into public.snapshot(id,capture_type,source_url,content_gzip,parser_version)values(${snapshot},'post','https://example.test/concept-fixture',${Buffer.from('fixture')},'fixture')`;
  await tx`insert into public.processing_head(scope_key,input_fingerprint)values(${scope},${fingerprint})`;
  await tx`insert into public.processing_job(id,snapshot_id,target_id,kind,scope_key,input_fingerprint)values(${job},${snapshot},${person},'index',${scope},${fingerprint})`;
  const reject={requestId:randomUUID(),subjectId:person,conceptId:concept,decision:'reject' as const,observationId:proof.observationId,reason:'  Withdraw this interpretation.\n  '};
  await assert.rejects(store.decide({...reject,observationId:artifactProof.observationId}),/CONCEPT_ASSOCIATION_STALE/);checks++;
  equal((await store.decide(reject)).replayed,false);equal((await store.decide(reject)).replayed,true);
  equal((await panel()).items[0]!.status,'historical');equal((await panel()).items[0]!.history[0]!.withdrawalReason,reject.reason);
  equal((await tx`select state from public.relationship where id=${dependentEdge}`)[0]!.state,'candidate');
  equal((await tx`select state from public.processing_job where id=${job}`)[0]!.state,'superseded');
  equal((await store.decide(input)).replayed,true);equal((await panel()).items[0]!.supportCount,0);
  await assert.rejects(store.decide({...reject,reason:'changed'}),/CONCEPT_ASSOCIATION_REQUEST_CONFLICT/);checks++;
  const renewed=await store.decide({...input,requestId:randomUUID()});equal(renewed.observationId===proof.observationId,false);
  markValidationStage('concept_association_retirement');
  const newLabel=label+' changed';await tx`update public.concept set label=${newLabel},kind='topic' where id=${concept}`;
  equal((await panel()).items[0]!.status,'historical');equal((await panel()).items[0]!.history.some(row=>row.current),false);
  equal((await inspectPersonTransaction(tx,person)).page!.observations.find(row=>row.id===renewed.observationId)!.active,false);
  const population=(await readRetrievalTransaction(tx,{mode:'recall',terms:[],constraints:[],objectKinds:['person']})).output;
  equal(population.candidates.find(row=>row.id===person)!.evidence.some(row=>row.provenance?.observationId===renewed.observationId),false);
  await assert.rejects(store.decide({...input,requestId:randomUUID()}),/CONCEPT_ASSOCIATION_STALE/);checks++;
  // Even a now-historical meaning can be explicitly withdrawn before reviewing the renamed Concept.
  await store.decide({...reject,requestId:randomUUID(),observationId:renewed.observationId});
  const currentInput={...input,requestId:randomUUID(),expectedConcept:{label:newLabel,kind:'topic' as const}};
  await store.decide(currentInput);equal((await panel()).items[0]!.status,'owner-reviewed');
  await tx`update public.object_ref set archived_at=now() where id=${concept}`;
  equal((await panel()).items[0]!.status,'historical');equal((await panel('concept',concept)).available,false);
  equal((await panel('person',person,{q:tag})).concepts.length,0);
  await assert.rejects(store.decide({...currentInput,requestId:randomUUID(),subjectId:artifact}),/CONCEPT_ASSOCIATION_TARGET_UNAVAILABLE/);checks++;
  await tx`update public.object_ref set archived_at=null where id=${concept}`;
  await tx`update public.object_ref set archived_at=now() where id=${person}`;
  equal((await panel()).available,false);equal((await panel()).items[0]!.status,'historical');
  await assert.rejects(store.decide({...currentInput,requestId:randomUUID()}),/CONCEPT_ASSOCIATION_TARGET_UNAVAILABLE/);checks++;
  // Legacy endpoint collisions and rejected managed edges are never adopted or revived.
  const legacyConcept=randomUUID();await tx`insert into public.concept(id,label,kind)values(${legacyConcept},'Legacy fixture','concept')`;
  await tx`insert into public.relationship(id,from_object_id,to_object_id,predicate,state,origin_key)values(${randomUUID()},${artifact},${legacyConcept},'associated_with_concept','candidate',${`legacy-concept:${tag}`})`;
  await assert.rejects(store.decide({...input,requestId:randomUUID(),subjectId:artifact,conceptId:legacyConcept,expectedConcept:{label:'Legacy fixture',kind:'concept'}}),/CONCEPT_ASSOCIATION_TARGET_UNAVAILABLE/);checks++;
  await tx`update public.relationship set state='rejected' where from_object_id=${artifact} and to_object_id=${concept} and predicate='associated_with_concept'`;
  equal((await panel('artifact',artifact)).items[0]!.status,'rejected');
  await assert.rejects(store.decide({...currentInput,requestId:randomUUID(),subjectId:artifact}),/CONCEPT_ASSOCIATION_TARGET_UNAVAILABLE/);checks++;
  markValidationStage('concept_association_paging');
  const paged=randomUUID();await tx`insert into public.person(id,name,profile_url)values(${paged},'Association paging fixture',null)`;
  for(let index=0;index<21;index++){
   const c=randomUUID(),origin=conceptAssociationOrigin(paged,c);await tx`insert into public.concept(id,label,kind)values(${c},${`Paging ${tag} ${index}`},'concept')`;
   await tx`insert into public.relationship(id,from_object_id,to_object_id,predicate,state,origin_key)values(${migrationId(origin)},${paged},${c},'associated_with_concept','candidate',${origin})`;
  }
  const first=await panel('person',paged,{q:`Paging ${tag}`});equal(first.items.length,20);equal(first.concepts.length,20);
  const next=await panel('person',paged,{cursor:first.nextCursor!,q:`Paging ${tag}`,searchCursor:first.nextSearchCursor!});equal(next.items.length,1);equal(next.concepts.length,1);
  equal(first.items.some(row=>row.id===next.items[0]!.id),false);equal(first.concepts.some(row=>row.id===next.concepts[0]!.id),false);
  // Seed immutable, withdrawn synthetic history to exercise full proof paging without 21 writer retries.
  await tx`update public.object_ref set archived_at=null where id=${person}`;
  const edgeId=migrationId(conceptAssociationOrigin(person,concept)),historyBefore=(await panel()).items[0]!.historyCount;
  const history=Array.from({length:21},()=>{const request={...currentInput,requestId:randomUUID()},origin=`reviewed-concept-decision-v1:${request.requestId}`;
   return {id:migrationId(origin),reason:request.reason,request,origin};});
  await tx`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,structured_value,field_key,support_status,origin_key)
   select x.id::uuid,${person},'user','relationship_assertion',x.reason,jsonb_build_object('predicate','associated_with_concept','to_object_id',${concept}::text,'request',x.request),
    'reviewed_concept','partial',x.origin from jsonb_to_recordset(${tx.json(history)}) as x(id text,reason text,request jsonb,origin text)`;
  await tx`insert into public.relationship_support(relationship_id,observation_id)select ${edgeId},id from public.observation where id=any(${history.map(row=>row.id)})`;
  const reviews=history.map(row=>({id:randomUUID(),observationId:row.id,comment:canonical({...reject,requestId:randomUUID(),observationId:row.id})}));
  await tx`insert into public.observation_review(id,observation_id,decision,comment)select x.id::uuid,x."observationId"::uuid,'rejected',x.comment
   from jsonb_to_recordset(${tx.json(reviews)}) as x(id text,"observationId" text,comment text)`;
  const historyPage=await panel('person',person,{historyEdge:edgeId});equal(historyPage.items[0]!.historyCount,historyBefore+21);equal(historyPage.items[0]!.history.length,20);
  const more=await panel('person',person,{historyEdge:edgeId,historyCursor:historyPage.items[0]!.nextHistoryCursor!});
  equal(more.items[0]!.history.length,historyBefore+1);equal(more.items[0]!.nextHistoryCursor,null);
  equal(historyPage.items[0]!.history.some(row=>more.items[0]!.history.some(other=>other.id===row.id)),false);
  equal((await panel('artifact',artifact,{historyEdge:edgeId})).items.length,0);
  await tx`set constraints all immediate`;checks++;throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 return checks;
}
