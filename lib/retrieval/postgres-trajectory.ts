import type postgres from 'postgres';
import type {Candidate,Request} from './evidence';
import {resolveRelationshipConcept,RelationshipClarification} from './relationship-filters';
import {trajectoryQueryValue} from '../relationships/trajectory';
import {trajectoryClaims} from '../relationships/trajectory-store';
import {validateTrajectoryIntent} from './trajectory-intent';
export async function addTrajectoryFilters(sql:postgres.TransactionSql,request:Request,candidates:Candidate[]){
 const filters=request.constraints.filter(v=>v.field==='trajectory');if(!filters.length)return;
 if(filters.length!==1)throw new RelationshipClarification(['Ask for one directed transition at a time; an ordered multi-step path is not supported.']);
 let value;try{value=trajectoryQueryValue.parse(JSON.parse(filters[0]!.value));}catch{throw new RelationshipClarification(['Specify the transition destination and, when known, its origin.']);}
 if(request.question)validateTrajectoryIntent(request.question,value);
 const concepts=await sql<{id:string;label:string;kind:'concept'|'topic'}[]>`select c.id,c.label,c.kind from public.concept c
  join public.object_ref r on r.id=c.id and r.archived_at is null where not exists(select 1 from public.object_alias a where a.former_object_id=c.id) order by c.id limit 5001`;
 if(concepts.length>5000)throw new Error('TRAJECTORY_CONCEPT_LIMIT');
 const from=value.from?resolveRelationshipConcept({field:'trajectory',value:value.from},concepts,request.question):null;
 const to=resolveRelationshipConcept({field:'trajectory',value:value.to},concepts,request.question);
 if(from?.id===to.id)throw new RelationshipClarification(['Choose distinct origin and destination meanings.']);
 const people=await sql<{id:string}[]>`select distinct subject_id as id from public.observation
  where field_key='reviewed_trajectory' and origin_key like 'explicit-trajectory-v1:%' order by subject_id limit 5001`;
 if(people.length>5000)throw new Error('TRAJECTORY_PERSON_LIMIT');
 const byId=new Map(candidates.map(v=>[v.id,v]));
 for(const candidate of candidates)candidate.completeFields=[...new Set([...(candidate.completeFields??[]),'trajectory'])];
 for(const person of people){
  const candidate=byId.get(person.id);if(!candidate)continue;
  const claim=(await trajectoryClaims(sql,person.id)).find(v=>v.confirmed&&v.claim.to.id===to.id&&(!from||v.claim.from.id===from.id));
  if(!claim)continue;
  const id=`trajectory:${claim.id}:object:${person.id}`;
  candidate.evidence.push({id,objectId:person.id,text:claim.text,layer:'user',verified:true,filterOnly:true,
   provenance:{observationId:claim.id,supportStatus:'owner_reviewed_transition',trajectory:{id:claim.id,from:claim.claim.from,to:claim.claim.to,
    order:claim.order,...(claim.claim.chronology?{chronology:claim.claim.chronology}:{}),supportingObservationIds:claim.claim.supportingObservationIds,
    ...('candidateId' in claim.claim&&claim.claim.candidateId?{candidateId:claim.claim.candidateId}:{})}}});
  candidate.facts.push({...filters[0]!,evidenceId:id});
 }
}
