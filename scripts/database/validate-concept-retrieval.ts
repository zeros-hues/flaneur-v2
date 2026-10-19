import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixtureConnection,type Connection} from './fixture-connection';
import {markValidationStage} from './validation-stage';
import {postgresConceptAssociationStore} from '../../lib/relationships/concept-association';
import {saveCaptureV2} from '../../lib/capture/v2-save';
import {postgresCaptureStore} from '../../lib/capture/v2-postgres';
import {postgresAuthorshipStore} from '../../lib/relationships/authorship';
import {memoryQuery} from '../../lib/query/memory';
import {memoryLabelsInTransaction} from '../../lib/query/postgres-labels';
import {readRetrievalTransaction,postgresRetrievalReader} from '../../lib/retrieval/postgres-reader';

export async function validateConceptRetrieval(connection:Connection){
 markValidationStage('concept_retrieval_initial');let checks=0;const rollback=new Error('CONCEPT_RETRIEVAL_ROLLBACK');
 const equal=(actual:unknown,expected:unknown)=>{assert.deepEqual(actual,expected);checks++;};
 // Actual application wrapper opens and verifies a read-only transaction.
 equal(Array.isArray(await postgresRetrievalReader(connection).read({mode:'recall',terms:[],constraints:[]})),false);
 try{await connection.begin('isolation level read committed',async tx=>{
  await tx`set local statement_timeout='20s'`;await tx`set local lock_timeout='5s'`;await tx`set local idle_in_transaction_session_timeout='30s'`;
  const target=fixtureConnection(tx),person=randomUUID(),legacy=randomUUID(),concept=randomUUID(),second=randomUUID(),tag=randomUUID().replaceAll('-','');
  const label=`Correspondence ${tag}`,secondLabel=`Fieldwork ${tag}`,name=`Concept Ada ${tag}`,topic=`orchid${tag}`;
  await tx`insert into public.person(id,name,profile_url)values(${person},${name},null)`;
  await tx`insert into public.artifact(id,type,source_url)values(${legacy},'social_post',${`https://example.test/${tag}`})`;
  for(const [id,text] of [[concept,label],[second,secondLabel]])await tx`insert into public.concept(id,label,kind)values(${id!},${text!},'concept')`;
  for(const subject of [person,legacy])await tx`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,support_status)
   values(${randomUUID()},${subject},'user','note',${topic},'verified')`;
  await tx`insert into public.concept_link(concept_id,artifact_id,source)values(${concept},${legacy},'inferred')`;
  const urn=`urn:li:activity:${BigInt('0x'+tag.slice(0,14)).toString()}`;
  const capture=await saveCaptureV2(postgresCaptureStore(target),{version:2,requestId:randomUUID(),adapterId:'linkedin',kind:'social_post',
   sourceUrl:`https://www.linkedin.com/feed/update/${urn}/`,urn,html:'<div role="listitem" componentkey="update-card-focus-fixture">Captured fixture</div>',
   reasonForNoticing:topic,extensionVersion:'fixture',clientCapturedAt:'2026-10-18T00:00:00Z'});
  const [snapshot]=await tx`select artifact_id from public.snapshot where id=${capture.snapshotId}`;const artifact=snapshot!.artifact_id as string;
  const run=async(value=label,kinds?:string[],terms=[topic],extra:{field:string;value:string}[]=[],question=`my reviewed associations with ${value}${extra.map(row=>' and '+row.value).join('')}`)=>
   memoryQuery(question,'2026-10-18T00:00:00Z',{planner:{plan:async()=>JSON.stringify({mode:'recall',terms,constraints:[{field:'associated_with_concept',value},...extra],
    ...(kinds?{objectKinds:kinds}:{}),encounteredBetween:null,ambiguities:[],interpretation:'Fixture owner-reviewed Concept recall'})},
    reader:{read:async request=>(await readRetrievalTransaction(tx,request)).output},labels:ids=>memoryLabelsInTransaction(tx,ids)});
  equal((await run()).items.length,0);equal((await run()).uncertainTotal,0); // Legacy inferred link cannot qualify.
  const store=postgresConceptAssociationStore(target),input={requestId:randomUUID(),subjectId:artifact,conceptId:concept,decision:'confirm' as const,
   expectedConcept:{label,kind:'concept' as const},reason:'  My interpretation; no source mention is asserted.\n  '};
  const artifactProof=await store.decide(input);
  let result=await run();equal(result.items.length,1);equal(result.items[0]!.id,artifact);equal(result.items[0]!.kind,'artifact');equal(result.items[0]!.uncertain,false);
  const evidence=result.items[0]!.evidence.find(row=>row.provenance?.relationship?.predicate==='associated_with_concept')!;
  equal(evidence.text,input.reason);equal(evidence.layer,'user');equal(evidence.filterOnly,true);equal(evidence.provenance!.observationId,artifactProof.observationId);
  const relation=evidence.provenance!.relationship!;assert.equal(relation.predicate,'associated_with_concept');checks++;
  if(relation.predicate==='associated_with_concept'){equal(relation.conceptId,concept);equal(relation.conceptLabel,label);equal(relation.conceptKind,'concept');}
  equal(evidence.provenance!.snapshotId,undefined);equal(evidence.provenance!.encounterId,undefined);
  markValidationStage('concept_retrieval_scope');
  equal((await run(label,undefined,[tag])).items.length,0); // A label in relationship metadata is not topical text.
  equal((await run(label,['artifact'],[])).items.length,1);
  equal((await run(label,['person'])).items.length,0);
  await postgresAuthorshipStore(target).decide({requestId:randomUUID(),snapshotId:capture.snapshotId,personId:person,decision:'confirm',reason:'Reviewed fixture author.'});
  equal((await run(label,['person'])).items.length,0); // No Artifact -> author Concept propagation.
  const personProof=await store.decide({...input,requestId:randomUUID(),subjectId:person});
  result=await run();equal(result.items.length,2);equal(result.items.map(row=>row.id).sort(),[person,artifact].sort());
  equal((await run(label,['person'])).items[0]!.id,person);equal((await run(label,['artifact'])).items[0]!.id,artifact);
  const combined=await run(label,undefined,[topic],[{field:'authored_by',value:name}]);equal(combined.items.length,1);equal(combined.items[0]!.id,artifact);
  equal(combined.items[0]!.evidence.filter(row=>row.provenance?.relationship).length,2);
  equal((await run(label,['person'],[topic],[{field:'authored_by',value:name}])).state,'clarification');
  equal((await run(label,['encounter'])).state,'clarification');
  equal((await run(`missing${tag}`)).state,'clarification');
  equal((await run(label,undefined,[topic],[],`my associations with ${secondLabel}`)).state,'clarification');
  markValidationStage('concept_retrieval_identity');
  const duplicate=randomUUID();await tx`insert into public.concept(id,label,kind)values(${duplicate},${label},'topic')`;
  equal((await run()).state,'clarification');equal((await run(`concept:${concept}`)).items.length,2);
  equal((await run(`concept:${concept}`,undefined,[topic],[],`my associations with ${label}`)).state,'clarification');
  await tx`update public.object_ref set archived_at=now() where id=${duplicate}`;
  await store.decide({...input,requestId:randomUUID(),subjectId:person,conceptId:second,expectedConcept:{label:secondLabel,kind:'concept'}});
  equal((await run(label,undefined,[topic],[{field:'associated_with_concept',value:secondLabel}])).items[0]!.id,person);
  await tx`update public.relationship set state='candidate' where from_object_id=${artifact} and to_object_id=${concept} and predicate='associated_with_concept'`;
  equal((await run(label,['artifact'])).items.length,0);equal((await run(label,['artifact'])).uncertainTotal,0);
  await tx`update public.relationship set state='active' where from_object_id=${artifact} and to_object_id=${concept} and predicate='associated_with_concept'`;
  await store.decide({requestId:randomUUID(),subjectId:person,conceptId:concept,decision:'reject',observationId:personProof.observationId,reason:'Withdraw Person interpretation.'});
  equal((await run()).items.length,1);equal((await run(label,['person'])).items.length,0);
  markValidationStage('concept_retrieval_retirement');
  const changed=label+' revised';await tx`update public.concept set label=${changed},kind='topic' where id=${concept}`;
  equal((await run(changed)).items.length,0);equal((await run(label)).state,'clarification');
  const renewed=await store.decide({...input,requestId:randomUUID(),expectedConcept:{label:changed,kind:'topic'}});
  equal((await run(changed)).items[0]!.id,artifact);
  await tx`update public.object_ref set archived_at=now() where id=${artifact}`;equal((await run(changed)).items.length,0);
  await tx`update public.object_ref set archived_at=null where id=${artifact}`;
  await tx`update public.relationship set state='rejected' where from_object_id=${artifact} and to_object_id=${concept} and predicate='associated_with_concept'`;
  equal((await run(changed)).items.length,0);
  // A still-current second association retires with its Person and with its Concept.
  equal((await run(secondLabel,['person'])).items[0]!.id,person);
  await tx`update public.object_ref set archived_at=now() where id=${person}`;equal((await run(secondLabel)).items.length,0);
  await tx`update public.object_ref set archived_at=null where id=${person}`;
  await tx`update public.object_ref set archived_at=now() where id=${second}`;equal((await run(secondLabel)).state,'clarification');
  equal((await run(`concept:${second}`)).state,'clarification');
  equal((await tx`select body_text from public.observation where id=${renewed.observationId}`)[0]!.body_text,input.reason);
  equal((await tx`select count(*)::int as n from public.concept_link where concept_id=${concept} and artifact_id=${legacy}`)[0]!.n,1);
  await tx`set constraints all immediate`;checks++;throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 return checks;
}
