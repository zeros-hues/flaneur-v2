import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixtureConnection,type Connection} from './fixture-connection';
import {markValidationStage} from './validation-stage';
import {postgresTrajectoryStore,trajectoryClaims} from '../../lib/relationships/trajectory-store';
import {trajectoryPanelTransaction,trajectoryPanelReader} from '../../lib/relationships/trajectory-reader';
import {postgresCareerStore} from '../../lib/relationships/career';
import {postgresConceptAssociationStore} from '../../lib/relationships/concept-association';
import {readRetrievalTransaction} from '../../lib/retrieval/postgres-reader';
import {memoryQuery} from '../../lib/query/memory';
import {memoryLabelsInTransaction} from '../../lib/query/postgres-labels';
import {readReviewGraph} from '../../lib/processing/postgres-dependencies';
import {migrationId} from '../../lib/migration/identity';
export async function validateTrajectory(connection:Connection){
 let checks=0;const rollback=new Error('TRAJECTORY_VALIDATION_ROLLBACK');
 const equal=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
 markValidationStage('trajectory_read_only');equal(await trajectoryPanelReader(connection)(randomUUID()),null);
 try{await connection.begin('isolation level read committed',async tx=>{
  await tx`set local statement_timeout='20s'`;await tx`set local lock_timeout='5s'`;await tx`set local idle_in_transaction_session_timeout='30s'`;
  const target=fixtureConnection(tx),store=postgresTrajectoryStore(target),career=postgresCareerStore(target),concepts=postgresConceptAssociationStore(target);
  const tag=randomUUID().replaceAll('-',''),people=[randomUUID(),randomUUID(),randomUUID(),randomUUID()],person=people[1]!,candidatePerson=people[2]!;
  const from={id:randomUUID(),label:`Mechanical engineering ${tag}`,kind:'concept' as const},to={id:randomUUID(),label:`AI ${tag}`,kind:'concept' as const},extra={id:randomUUID(),label:`3D interaction ${tag}`,kind:'concept' as const};
  const school=randomUUID(),employer=randomUUID(),schoolLabel=`EPFL ${tag}`,employerLabel=`IDEO ${tag}`,artifact=randomUUID();
  for(const id of people)await tx`insert into public.person(id,name)values(${id},${`Trajectory ${id}`})`;
  for(const c of [from,to,extra])await tx`insert into public.concept(id,label,kind)values(${c.id},${c.label},${c.kind})`;
  for(const [id,label] of [[school,schoolLabel],[employer,employerLabel]])await tx`insert into public.organisation(id,slug,display_name)values(${id!},${id!},${label!})`;
  await tx`insert into public.artifact(id,type,source_url)values(${artifact},'profile_page',${`https://example.test/${tag}`})`;
  const input={requestId:randomUUID(),personId:person,decision:'confirm' as const,from,to,reason:'  Explicit reviewed move, not mere co-occurrence.\n',supportingObservationIds:[] as string[]};
  const run=async(origin:string|null=from.label,destination=to.label,constraints:{field:string;value:string}[]=[],kinds?:string[],question=`Who moved ${origin?'from '+origin+' into':'into'} ${destination}${constraints.map(v=>' and '+v.value).join('')}?`)=>memoryQuery(question,'2026-10-18T00:00:00Z',{
   planner:{plan:async()=>JSON.stringify({mode:'recall',terms:[],constraints,trajectory:{from:origin,to:destination},...(kinds?{objectKinds:kinds}:{}),encounteredBetween:null,ambiguities:[],interpretation:'Fixture explicit directed transition'})},
   reader:{read:async req=>(await readRetrievalTransaction(tx,req)).output},labels:ids=>memoryLabelsInTransaction(tx,ids)});
  markValidationStage('trajectory_cooccurrence');
  await career.decide({requestId:randomUUID(),personId:people[0],organisationId:school,predicate:'educated_at',decision:'confirm',expectedOrganisation:schoolLabel,fieldOfStudy:from.label,reason:'Education only.'});
  await concepts.decide({requestId:randomUUID(),subjectId:people[0],conceptId:to.id,decision:'confirm',expectedConcept:{label:to.label,kind:to.kind},reason:'AI association only; no transition.'});
  equal((await run()).items.length,0);equal((await run()).uncertainTotal,0);
  const proof=await store.decide(input);equal(proof.replayed,false);equal((await store.decide(input)).replayed,true);
  for(const [layer,body] of [['user','Mismatched immutable body'],['inferred',input.reason]]){
   const malformed={...input,requestId:randomUUID(),personId:people[0]!},key=`explicit-trajectory-v1:${malformed.requestId}`;
   await tx`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,structured_value,field_key,support_status,origin_key)
    values(${migrationId(key)},${people[0]!},${layer!},'relationship_assertion',${body!},${tx.json({version:'explicit-trajectory-v1',request:malformed})},'reviewed_trajectory','partial',${key})`;
  }
  let result=await run();equal(result.items.map(v=>v.id),[person]);equal(result.items[0]!.kind,'person');equal(result.uncertainTotal,0);
  const evidence=result.items[0]!.evidence.find(v=>v.provenance?.trajectory)!;equal(evidence.layer,'user');equal(evidence.filterOnly,true);equal(evidence.text,input.reason);
  equal(evidence.provenance!.trajectory!.from.id,from.id);equal(evidence.provenance!.trajectory!.to.id,to.id);equal(evidence.provenance!.trajectory!.order,'unknown');equal(evidence.provenance!.snapshotId,undefined);
  equal((await run(to.label,from.label)).items.length,0);equal((await run(null)).items.map(v=>v.id),[person]);
  await store.decide({...input,requestId:randomUUID(),personId:people[3]!,from:to,to:from});equal((await run()).items.map(v=>v.id),[person]);equal((await run(to.label,from.label)).items.map(v=>v.id),[people[3]]);
  equal((await run(from.label,to.label,[],['artifact'])).state,'clarification');equal((await run(from.label,to.label,[],['encounter'])).state,'clarification');
  for(const field of ['authored_by','profile_of'])equal((await run(from.label,to.label,[{field,value:'Ada'}])).state,'clarification');
  await assert.rejects(store.decide({...input,requestId:randomUUID(),personId:artifact}),/TRAJECTORY_TARGET_UNAVAILABLE/);checks++;
  await assert.rejects(store.decide({...input,reason:'Changed UUID reuse'}),/TRAJECTORY_REQUEST_CONFLICT/);checks++;
  markValidationStage('trajectory_composition');
  for(const [predicate,organisationId,label] of [['educated_at',school,schoolLabel],['employed_by',employer,employerLabel]])await career.decide({requestId:randomUUID(),personId:person,organisationId,predicate,decision:'confirm',expectedOrganisation:label,reason:'Independent career fact.'});
  await concepts.decide({requestId:randomUUID(),subjectId:person,conceptId:extra.id,decision:'confirm',expectedConcept:{label:extra.label,kind:extra.kind},reason:'Independent direct Concept association.'});
  const constraints=[{field:'educated_at',value:schoolLabel},{field:'employed_by',value:employerLabel},{field:'associated_with_concept',value:extra.label}];
  for(const filter of constraints)equal((await run(from.label,to.label,[filter])).items.map(v=>v.id),[person]);
  equal((await run(from.label,to.label,constraints)).items.map(v=>v.id),[person]);
  equal((await run(from.label,to.label,constraints,undefined,`Who moved from ${from.label} into ${extra.label} and is associated with ${to.label}?`)).state,'clarification');
  equal((await run(from.label,to.label,[constraints[0]!],undefined,`Who studied at ${schoolLabel} and later moved from ${from.label} into ${to.label}?`)).state,'clarification');
  markValidationStage('trajectory_ambiguity');const duplicate=randomUUID();await tx`insert into public.concept(id,label,kind)values(${duplicate},${to.label},'topic')`;
  equal((await run()).state,'clarification');equal((await run(from.label,`concept:${to.id}`)).items.map(v=>v.id),[person]);
  await tx`update public.object_ref set archived_at=now() where id=${duplicate}`;
  equal((await run(`concept:${from.id}`,`concept:${to.id}`)).items.map(v=>v.id),[person]);
  const rawRequest={mode:'recall' as const,terms:[],constraints:[{field:'trajectory',value:JSON.stringify({from:from.label,to:to.label})}],question:`Who moved from ${to.label} into ${from.label}?`};
  await assert.rejects(readRetrievalTransaction(tx,rawRequest));checks++;
  markValidationStage('trajectory_candidate');
  const supports:string[]=[randomUUID(),randomUUID()];
  await tx`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,support_status)values
   (${supports[0]!},${candidatePerson},'user','note',${from.label+' 2018 2021'},'verified'),
   (${supports[1]!},${candidatePerson},'user','note',${to.label+' 2022 2024'},'verified')`;
  const chronology={from:{start:'2018',end:'2021',ongoing:false},to:{start:'2022',end:'2024',ongoing:false}};
  const candidate={...input,requestId:randomUUID(),personId:candidatePerson,decision:'candidate' as const,chronology,supportingObservationIds:supports,reason:'Dates suggest a possible path, not a move.'};
  const proposed=await store.decide(candidate);equal((await run()).items.map(v=>v.id),[person]);
  await assert.rejects(store.decide({...input,requestId:randomUUID(),supportingObservationIds:supports}),/TRAJECTORY_SUPPORT_UNAVAILABLE/);checks++;
  await assert.rejects(store.decide({...input,requestId:randomUUID(),candidateId:proposed.observationId}),/TRAJECTORY_STALE/);checks++;
  let panel=await trajectoryPanelTransaction(tx,candidatePerson);equal(panel!.items[0]!.confirmed,false);equal(panel!.items[0]!.layer,'inferred');equal(panel!.items[0]!.order,'ordered');equal(panel!.items[0]!.evidence.length,2);
  const confirmation={...candidate,requestId:randomUUID(),decision:'confirm' as const,candidateId:proposed.observationId,reason:'I explicitly confirm the move after reviewing additional context.'};
  const reviewed=await store.decide(confirmation);equal((await store.decide(confirmation)).replayed,true);
  equal((await run()).items.map(v=>v.id).sort(),[person,candidatePerson].sort());
  result=await run();const supported=result.items.find(v=>v.id===candidatePerson)!;equal(supported.evidence.filter(v=>supports.includes(v.provenance?.observationId??'')).length,2);
  equal(supported.evidence.find(v=>v.provenance?.trajectory)!.provenance!.trajectory!.candidateId,proposed.observationId);
  panel=await trajectoryPanelTransaction(tx,candidatePerson);equal(panel!.items.find(v=>v.id===proposed.observationId)!.reviews[0]!.decision,'confirmed');
  equal(panel!.items.find(v=>v.id===reviewed.observationId)!.confirmed,true);
  equal((await readReviewGraph(tx)).nodes.find(v=>v.id===reviewed.observationId)!.relationshipReview,true);
  const invalidCandidate={...candidate,requestId:randomUUID(),chronology:{...chronology,from:{...chronology.from,end:'2019'}}};
  await assert.rejects(store.decide(invalidCandidate),/TRAJECTORY_SUPPORT_UNAVAILABLE/);checks++;
  await assert.rejects(store.decide({...candidate,requestId:randomUUID(),supportingObservationIds:[supports[0]!,randomUUID()]}),/TRAJECTORY_SUPPORT_UNAVAILABLE/);checks++;
  // Missing recorded dependency cannot be replaced by whatever evidence happens to exist today.
  await tx`delete from public.observation_evidence where observation_id=${reviewed.observationId} and supporting_observation_id=${supports[0]!}`;
  equal((await run()).items.map(v=>v.id),[person]);
  await tx`insert into public.observation_evidence(observation_id,supporting_observation_id,support_role,evidence_version)values(${reviewed.observationId},${supports[0]!},'supports','explicit-trajectory-v1')`;
  await tx`update public.object_ref set archived_at=now() where id=${supports[1]!}`;equal((await run()).items.map(v=>v.id),[person]);
  await tx`update public.object_ref set archived_at=null where id=${supports[1]!}`;
  markValidationStage('trajectory_correction');
  const correction={...input,requestId:randomUUID(),decision:'correct' as const,observationId:proof.observationId,from:to,to:from,reason:'The originally recorded direction was wrong.'};
  const corrected=await store.decide(correction);equal((await store.decide(correction)).replayed,true);equal((await run()).items.map(v=>v.id),[candidatePerson]);
  equal((await run(to.label,from.label)).items.map(v=>v.id).sort(),[person,people[3]].sort());
  panel=await trajectoryPanelTransaction(tx,person);equal(panel!.items.find(v=>v.id===proof.observationId)!.reviews[0]!.decision,'corrected');equal(panel!.items.find(v=>v.id===proof.observationId)!.reviews[0]!.comment,correction.reason);
  await store.decide(input);equal((await run()).items.map(v=>v.id),[candidatePerson]);
  const withdrawal={requestId:randomUUID(),personId:person,decision:'reject' as const,observationId:corrected.observationId,reason:'Withdraw the corrected transition.'};
  equal((await store.decide(withdrawal)).replayed,false);equal((await store.decide(withdrawal)).replayed,true);
  equal((await run(to.label,from.label)).items.map(v=>v.id),[people[3]]);
  markValidationStage('trajectory_chronology');
  const partial={...input,requestId:randomUUID(),chronology:{from:{start:'2018',end:null,ongoing:true},to:{start:'2022-02',end:null,ongoing:false}}};
  const partialProof=await store.decide(partial);equal((await trajectoryClaims(tx,person)).find(v=>v.id===partialProof.observationId)!.order,'unknown');
  const overlap={...input,requestId:randomUUID(),chronology:{from:{start:'2018',end:'2023',ongoing:false},to:{start:'2022',end:'2024',ongoing:false}}};
  const overlapProof=await store.decide(overlap);equal((await trajectoryClaims(tx,person)).find(v=>v.id===overlapProof.observationId)!.order,'overlapping_or_uncertain');
  const archive={requestId:randomUUID(),personId:person,decision:'archive' as const,observationId:overlapProof.observationId,reason:'Archive this duplicate statement.'};
  equal((await store.decide(archive)).replayed,false);equal((await store.decide(archive)).replayed,true);
  equal((await tx`select archived_at is not null as archived from public.object_ref where id=${overlapProof.observationId}`)[0]!.archived,true);
  markValidationStage('trajectory_invalidation');
  await tx`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,support_status,supersedes_id)values(${randomUUID()},${person},'user','note','A generic revision cannot silently preserve structured transitions.','verified',${partialProof.observationId})`;
  equal((await run()).items.map(v=>v.id),[candidatePerson]);
  await tx`update public.concept set label=${`Changed ${tag}`} where id=${from.id}`;
  equal((await run(`Changed ${tag}`)).items.length,0);equal((await readReviewGraph(tx)).nodes.find(v=>v.id===reviewed.observationId)!.inactive,true);
  await tx`update public.concept set label=${from.label} where id=${from.id}`;
  await tx`update public.object_ref set archived_at=now() where id=${candidatePerson}`;equal((await run()).items.length,0);
  await tx`update public.object_ref set archived_at=null where id=${candidatePerson}`;
  await tx`update public.object_ref set archived_at=now() where id=${to.id}`;equal((await run()).state,'clarification');
  await tx`update public.object_ref set archived_at=null where id=${to.id}`;
  equal((await trajectoryPanelTransaction(tx,people[0]!))!.items.length,0); // No history leak to co-occurrence Person.
  await tx`set constraints all immediate`;checks++;throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 return checks;
}
