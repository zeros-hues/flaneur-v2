import type postgres from 'postgres';
import type {Candidate,Request} from './evidence';
import {relationshipField,personRelationshipField,relationshipScope,resolveRelationshipPerson,resolveRelationshipConcept} from './relationship-filters';
import {authorshipAssertions,authorshipOrigin} from '../relationships/authorship';
import {currentProfileProofs,currentProfileSupports,profileOrigin} from '../relationships/profile-store';
import {profileEdgeView} from '../relationships/profile-policy';
import {migrationId} from '../migration/identity';
import {conceptAssociationOrigin,conceptAssociationProofs} from '../relationships/concept-association';

/** Caller owns the same read-only snapshot as ordinary retrieval. No notes or source text flow to the planner. */
export async function addRelationshipFilters(sql:postgres.TransactionSql,request:Request,candidates:Candidate[]){
 const filters=request.constraints.filter(filter=>relationshipField(filter.field));if(!filters.length)return;
 relationshipScope(request);
 if(filters.some(filter=>personRelationshipField(filter.field)))await addPersonRelationshipFilters(sql,request,candidates);
 if(filters.some(filter=>filter.field==='associated_with_concept'))await addConceptRelationshipFilters(sql,request,candidates);
 if(candidates.reduce((count,candidate)=>count+candidate.evidence.filter(item=>!!item.provenance?.relationship).length,0)>5000)
  throw new Error('RELATIONSHIP_EVIDENCE_LIMIT');
}
async function addPersonRelationshipFilters(sql:postgres.TransactionSql,request:Request,candidates:Candidate[]){
 const filters=request.constraints.filter(filter=>personRelationshipField(filter.field));
 const people=await sql<{id:string;name:string}[]>`select p.id,p.name from public.person p join public.object_ref r on r.id=p.id
  where r.archived_at is null and not exists(select 1 from public.object_alias alias where alias.former_object_id=p.id)
  order by p.id limit 5001`;
 if(people.length>5000)throw new Error('RELATIONSHIP_PERSON_LIMIT');
 const resolved=filters.map(filter=>({filter,person:resolveRelationshipPerson(filter,people,request.question)}));
 const edges=await sql<{id:string;artifactId:string;personId:string;predicate:'authored_by'|'profile_of';state:string}[]>`
  select r.id,r.from_object_id as "artifactId",r.to_object_id as "personId",r.predicate,r.state
  from public.relationship r join public.object_ref a on a.id=r.from_object_id and a.kind='artifact' and a.archived_at is null
  where r.predicate=any(${[...new Set(filters.map(filter=>filter.field))]})
   and r.to_object_id=any(${[...new Set(resolved.map(row=>row.person.id))]})
   and ((r.predicate='authored_by' and r.origin_key='reviewed-authorship-v1:'||r.from_object_id::text||':'||r.to_object_id::text)
    or(r.predicate='profile_of' and r.origin_key='reviewed-profile-v1:'||r.from_object_id::text||':'||r.to_object_id::text))
   and not exists(select 1 from public.object_alias alias where alias.former_object_id=a.id)
  order by r.id limit 5001`;
 if(edges.length>5000)throw new Error('RELATIONSHIP_EDGE_LIMIT');
 const byId=new Map(candidates.map(candidate=>[candidate.id,candidate]));
 const authors=new Map<string,Awaited<ReturnType<typeof authorshipAssertions>>>();
 const profiles=new Map<string,{proofs:Awaited<ReturnType<typeof currentProfileProofs>>;supports:Awaited<ReturnType<typeof currentProfileSupports>>}>();
 let count=0;
 for(const candidate of candidates)candidate.completeFields=[...new Set([...(candidate.completeFields??[]),...filters.map(filter=>filter.field)])];
 for(const edge of edges){
  if(!resolved.some(row=>row.person.id===edge.personId&&row.filter.field===edge.predicate))continue;
  const candidate=byId.get(edge.artifactId);if(!candidate)continue;
  const expected=edge.predicate==='authored_by'?authorshipOrigin(edge.artifactId,edge.personId):profileOrigin(edge.artifactId,edge.personId);
  if(edge.id!==migrationId(expected))throw new Error('RELATIONSHIP_EDGE_CONFLICT');
  if(edge.state!=='active')continue;
  let proof:{id:string;snapshotId:string;encounterId:string;text:string}|undefined;
  if(edge.predicate==='authored_by'){
   if(!authors.has(edge.artifactId))authors.set(edge.artifactId,await authorshipAssertions(sql,edge.artifactId));
   const row=authors.get(edge.artifactId)!.find(row=>row.relationshipId===edge.id&&row.current&&row.encounterId);
   if(row)proof={id:row.id,snapshotId:row.snapshotId,encounterId:row.encounterId!,text:row.reason};
  }else{
   if(!profiles.has(edge.artifactId))profiles.set(edge.artifactId,{proofs:await currentProfileProofs(sql,edge.artifactId),supports:await currentProfileSupports(sql,edge.artifactId)});
   const data=profiles.get(edge.artifactId)!,view=profileEdgeView(edge,data.proofs,data.supports);
   if(view.state==='supported'&&view.support[0]){
    const support=view.support[0];
    const [observation]=await sql`select body_text from public.observation where id=${support.proofId}`;
    if(observation)proof={id:support.proofId,snapshotId:support.snapshotId,encounterId:support.encounterId,text:observation.body_text};
   }
  }
  if(!proof)continue;
  const evidenceId=`relationship:${edge.id}:object:${candidate.id}`;
  candidate.evidence.push({id:evidenceId,objectId:candidate.id,layer:'user',verified:true,filterOnly:true,text:proof.text,
   provenance:{observationId:proof.id,snapshotId:proof.snapshotId,encounterId:proof.encounterId,supportStatus:'owner_reviewed',
    relationship:{id:edge.id,predicate:edge.predicate,personId:edge.personId}}});
  for(const {filter,person} of resolved)if(person.id===edge.personId&&filter.field===edge.predicate)
   candidate.facts.push({field:filter.field,value:filter.value,evidenceId});
  if(++count>5000)throw new Error('RELATIONSHIP_EVIDENCE_LIMIT');
 }
}
async function addConceptRelationshipFilters(sql:postgres.TransactionSql,request:Request,candidates:Candidate[]){
 const filters=request.constraints.filter(filter=>filter.field==='associated_with_concept');
 const concepts=await sql<{id:string;label:string;kind:'concept'|'topic'}[]>`select c.id,c.label,c.kind from public.concept c
  join public.object_ref r on r.id=c.id and r.kind='concept' and r.archived_at is null
  where not exists(select 1 from public.object_alias alias where alias.former_object_id=c.id) order by c.id limit 5001`;
 if(concepts.length>5000)throw new Error('RELATIONSHIP_CONCEPT_LIMIT');
 const resolved=filters.map(filter=>({filter,concept:resolveRelationshipConcept(filter,concepts,request.question)}));
 const edges=await sql<{id:string;subjectId:string;conceptId:string;state:string}[]>`select r.id,r.from_object_id as "subjectId",r.to_object_id as "conceptId",r.state
  from public.relationship r join public.object_ref subject on subject.id=r.from_object_id and subject.kind in('person','artifact') and subject.archived_at is null
  where r.predicate='associated_with_concept' and r.origin_key='reviewed-concept-v1:'||r.from_object_id::text||':'||r.to_object_id::text
   and r.to_object_id=any(${[...new Set(resolved.map(row=>row.concept.id))]})
   and not exists(select 1 from public.object_alias alias where alias.former_object_id=subject.id) order by r.id limit 5001`;
 if(edges.length>5000)throw new Error('RELATIONSHIP_EDGE_LIMIT');
 const byId=new Map(candidates.map(candidate=>[candidate.id,candidate]));
 for(const candidate of candidates)candidate.completeFields=[...new Set([...(candidate.completeFields??[]),'associated_with_concept'])];
 for(const edge of edges){
  const candidate=byId.get(edge.subjectId);if(!candidate)continue;
  if(edge.id!==migrationId(conceptAssociationOrigin(edge.subjectId,edge.conceptId)))throw new Error('RELATIONSHIP_EDGE_CONFLICT');
  if(edge.state!=='active')continue;
  const proof=(await conceptAssociationProofs(sql,edge.id)).find(row=>row.current);if(!proof)continue;
  const evidenceId=`relationship:${edge.id}:object:${candidate.id}`;
  candidate.evidence.push({id:evidenceId,objectId:candidate.id,layer:'user',verified:true,filterOnly:true,text:proof.reason,
   provenance:{observationId:proof.id,supportStatus:'owner_reviewed_interpretation',relationship:{id:edge.id,predicate:'associated_with_concept',
    conceptId:edge.conceptId,conceptLabel:proof.conceptAtDecision.label,conceptKind:proof.conceptAtDecision.kind}}});
  for(const {filter,concept} of resolved)if(concept.id===edge.conceptId)candidate.facts.push({field:filter.field,value:filter.value,evidenceId});
 }
}
