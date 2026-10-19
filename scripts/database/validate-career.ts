import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixtureConnection,type Connection} from './fixture-connection';
import {markValidationStage} from './validation-stage';
import {postgresCareerStore,careerProofs,careerOrigin} from '../../lib/relationships/career';
import {careerPanelTransaction,careerPanelReader} from '../../lib/relationships/career-reader';
import {postgresConceptAssociationStore} from '../../lib/relationships/concept-association';
import {readRetrievalTransaction} from '../../lib/retrieval/postgres-reader';
import {memoryQuery} from '../../lib/query/memory';
import {memoryLabelsInTransaction} from '../../lib/query/postgres-labels';
import {migrationId} from '../../lib/migration/identity';
import {readReviewGraph} from '../../lib/processing/postgres-dependencies';
export async function validateCareer(connection:Connection){
 let checks=0;const rollback=new Error('CAREER_VALIDATION_ROLLBACK'),equal=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
 markValidationStage('career_read_only');equal(await careerPanelReader(connection)(randomUUID()),null);
 try{await connection.begin('isolation level read committed',async tx=>{
  await tx`set local statement_timeout='20s'`;await tx`set local lock_timeout='5s'`;await tx`set local idle_in_transaction_session_timeout='30s'`;
  const target=fixtureConnection(tx),store=postgresCareerStore(target),person=randomUUID(),other=randomUUID(),school=randomUUID(),employer=randomUUID(),concept=randomUUID(),artifact=randomUUID();
  const tag=randomUUID().replaceAll('-',''),schoolName=`EPFL ${tag}`,employerName=`IDEO ${tag}`,field=`Mechanical engineering ${tag}`,conceptName=`AI ${tag}`;
  for(const id of [person,other])await tx`insert into public.person(id,name)values(${id},${`Career ${id}`})`;
  for(const [id,label] of [[school,schoolName],[employer,employerName]])await tx`insert into public.organisation(id,slug,display_name)values(${id!},${id!},${label!})`;
  await tx`insert into public.concept(id,label,kind)values(${concept},${conceptName},'concept')`;
  await tx`insert into public.artifact(id,type,source_url)values(${artifact},'profile_page',${`https://example.test/${tag}`})`;
  // Earlier profile projections and source-only text cannot manufacture reviewed Person relationships.
  await tx`insert into public.education(id,person_id,school,field_of_study,sort_index)values(${randomUUID()},${other},${schoolName},${field},0)`;
  await tx`insert into public.role(id,person_id,organisation_id,title,sort_index)values(${randomUUID()},${other},${employer},'Engineer',0)`;
  const input={requestId:randomUUID(),personId:person,organisationId:school,predicate:'educated_at' as const,decision:'confirm' as const,expectedOrganisation:schoolName,fieldOfStudy:field,reason:'  Exact education evidence reviewed by owner.\n'};
  const run=async(constraints=[{field:'educated_at',value:schoolName}],kinds?:string[],question=`Who matches ${constraints.map(v=>v.value).join(' and ')}?`)=>memoryQuery(question,'2026-10-18T00:00:00Z',{
   planner:{plan:async()=>JSON.stringify({mode:'recall',terms:[],constraints,...(kinds?{objectKinds:kinds}:{}),encounteredBetween:null,ambiguities:[],interpretation:'Career fixture recall'})},
   reader:{read:async req=>(await readRetrievalTransaction(tx,req)).output},labels:ids=>memoryLabelsInTransaction(tx,ids)});
  markValidationStage('career_positive');equal((await run()).items.length,0);
  const proof=await store.decide(input),edge=migrationId(careerOrigin(person,school,'educated_at'));
  equal(proof.replayed,false);equal((await store.decide(input)).replayed,true);
  let result=await run();equal(result.items.map(v=>v.id),[person]);equal(result.items[0]!.kind,'person');equal(result.uncertainTotal,0);
  const evidence=result.items[0]!.evidence.find(e=>e.provenance?.relationship?.predicate==='educated_at')!;
  equal(evidence.layer,'user');equal(evidence.text,input.reason);equal(evidence.filterOnly,true);equal(evidence.provenance!.observationId,proof.observationId);equal(evidence.provenance!.snapshotId,undefined);
  equal((await run([{field:'field_of_study',value:field}])).items.map(v=>v.id),[person]);
  equal((await run([{field:'field_of_study',value:`other ${tag}`}])).items.length,0);
  const work={...input,requestId:randomUUID(),organisationId:employer,predicate:'employed_by' as const,expectedOrganisation:employerName,fieldOfStudy:undefined,reason:'Reviewed employment evidence.'};
  const workProof=await store.decide(work),workEdge=migrationId(careerOrigin(person,employer,'employed_by'));
  equal((await store.decide(work)).replayed,true); // Optional absent fields survive JSON storage/replay.
  equal((await run([{field:'employed_by',value:employerName}])).items.map(v=>v.id),[person]);
  const both=[{field:'educated_at',value:schoolName},{field:'employed_by',value:employerName},{field:'field_of_study',value:field}];
  equal((await run(both)).items.map(v=>v.id),[person]);equal((await run(both)).items[0]!.evidence.filter(e=>e.provenance?.relationship).length,2);
  await tx`update public.relationship set state='candidate' where id=${workEdge}`;
  equal((await run(both)).items.length,0);
  await tx`update public.relationship set state='active' where id=${workEdge}`;
  const concepts=postgresConceptAssociationStore(target),conceptInput={requestId:randomUUID(),subjectId:artifact,conceptId:concept,decision:'confirm',expectedConcept:{label:conceptName,kind:'concept'},reason:'Reviewed Artifact AI association.'};
  await concepts.decide(conceptInput);
  const mixed=[...both,{field:'associated_with_concept',value:conceptName}];equal((await run(mixed)).items.length,0);
  await concepts.decide({...conceptInput,requestId:randomUUID(),subjectId:person});equal((await run(mixed)).items.map(v=>v.id),[person]);
  equal((await run(both,['artifact'])).state,'clarification');equal((await run(both,['encounter'])).state,'clarification');
  for(const field of ['authored_by','profile_of'])equal((await run([...both,{field,value:'Ada'}])).state,'clarification');
  markValidationStage('career_identity');const duplicate=randomUUID();await tx`insert into public.organisation(id,slug,display_name)values(${duplicate},${duplicate},${schoolName})`;
  equal((await run()).state,'clarification');equal((await run([{field:'educated_at',value:`organisation:${school}`}])).items.map(v=>v.id),[person]);
  equal((await run([{field:'educated_at',value:`organisation:${school}`}],undefined,schoolName)).state,'clarification');
  equal((await run([{field:'employed_by',value:employerName}],undefined,schoolName)).state,'clarification');
  await tx`update public.object_ref set archived_at=now() where id=${duplicate}`;
  const page=await careerPanelTransaction(tx,person);equal(page!.items.length,2);equal(page!.items.find(v=>v.id===edge)!.history[0]!.reason,input.reason);
  equal((await careerPanelTransaction(tx,other,{historyEdge:edge}))!.items.length,0);
  equal((await readReviewGraph(tx)).nodes.find(v=>v.id===proof.observationId)!.relationshipReview,true);
  markValidationStage('career_withdrawal');const withdrawal={requestId:randomUUID(),personId:person,organisationId:school,predicate:'educated_at',decision:'reject',observationId:proof.observationId,reason:'This record needs correction.'};
  equal((await store.decide(withdrawal)).replayed,false);equal((await store.decide(withdrawal)).replayed,true);
  equal((await run()).items.length,0);equal((await run([{field:'field_of_study',value:field}])).items.length,0);
  equal((await careerProofs(tx,edge))[0]!.withdrawalReason,withdrawal.reason);
  await store.decide(input);equal((await run()).items.length,0); // Old replay cannot revive a withdrawal.
  const renewed=await store.decide({...input,requestId:randomUUID()});equal((await run()).items.length,1);
  await assert.rejects(store.decide({...input,reason:'Changed reuse'}),/CAREER_REQUEST_CONFLICT/);checks++;
  await assert.rejects(store.decide({...input,requestId:randomUUID(),personId:artifact}),/CAREER_TARGET_UNAVAILABLE/);checks++;
  markValidationStage('career_support_retirement');
  await tx`update public.object_ref set archived_at=now() where id=${renewed.observationId}`;equal((await run()).items.length,0);
  await tx`update public.object_ref set archived_at=null where id=${renewed.observationId}`;
  await tx`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,support_status,supersedes_id)values(${randomUUID()},${person},'user','note','A revision does not silently preserve typed fields.','verified',${renewed.observationId})`;
  equal((await run()).items.length,0);
  const current=await store.decide({...input,requestId:randomUUID()});
  await tx`delete from public.relationship_support where relationship_id=${edge} and observation_id=${current.observationId}`;
  await tx`update public.relationship set state='candidate' where id=${edge}`;
  equal((await run()).items.length,0);
  // Immutable malformed support cannot borrow a correct request, edge, owner or reason.
  const mismatchId=randomUUID();await tx`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,structured_value,field_key,support_status,origin_key)
   values(${mismatchId},${person},'user','relationship_assertion','Mismatched evidence',${tx.json({predicate:'educated_at',to_object_id:school,request:{...input,requestId:randomUUID()}})},'reviewed_career','partial',${`reviewed-career-decision-v1:${randomUUID()}`})`;
  await tx`insert into public.relationship_support(relationship_id,observation_id)values(${edge},${mismatchId})`;
  await tx`update public.relationship set state='active' where id=${edge}`;equal((await run()).items.length,0);
  markValidationStage('career_target_retirement');
  await tx`update public.organisation set display_name=${`Renamed ${tag}`} where id=${employer}`;
  equal((await run([{field:'employed_by',value:`Renamed ${tag}`}])).items.length,0);
  equal((await readReviewGraph(tx)).nodes.find(v=>v.id===workProof.observationId)!.inactive,true);
  await tx`update public.organisation set display_name=${employerName} where id=${employer}`;
  await tx`update public.object_ref set archived_at=now() where id=${person}`;equal((await run([{field:'employed_by',value:employerName}])).items.length,0);
  await tx`update public.object_ref set archived_at=null where id=${person}`;
  await tx`update public.object_ref set archived_at=now() where id=${employer}`;equal((await run([{field:'employed_by',value:employerName}])).state,'clarification');
  await tx`update public.object_ref set archived_at=null where id=${employer}`;
  await tx`update public.relationship set state='rejected' where id=${workEdge}`;equal((await run([{field:'employed_by',value:employerName}])).items.length,0);
  await assert.rejects(store.decide({...work,requestId:randomUUID()}),/CAREER_TARGET_UNAVAILABLE/);checks++;
  await tx`set constraints all immediate`;checks++;throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 return checks;
}
