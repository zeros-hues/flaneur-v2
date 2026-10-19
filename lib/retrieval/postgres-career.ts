import type postgres from 'postgres';
import type {Candidate,Request} from './evidence';
import {careerField,resolveRelationshipOrganisation,requireLiteralCareerValue,relationshipName} from './relationship-filters';
import {careerOrigin,careerProofs} from '../relationships/career';
import {migrationId} from '../migration/identity';
export async function addCareerFilters(sql:postgres.TransactionSql,request:Request,candidates:Candidate[]){
 const filters=request.constraints.filter(filter=>careerField(filter.field));if(!filters.length)return;
 const organisations=await sql<{id:string;name:string}[]>`select o.id,o.display_name as name from public.organisation o
  join public.object_ref r on r.id=o.id and r.kind='organisation' and r.archived_at is null
  where not exists(select 1 from public.object_alias a where a.former_object_id=o.id) order by o.id limit 5001`;
 if(organisations.length>5000)throw new Error('CAREER_ORGANISATION_LIMIT');
 const resolved=filters.map(filter=>{requireLiteralCareerValue(filter,request.question);return {filter,
  organisation:filter.field==='field_of_study'?null:resolveRelationshipOrganisation(filter,organisations,request.question)};});
 const edges=await sql<{id:string;person:string;organisation:string;predicate:'educated_at'|'employed_by';state:string}[]>`
  select r.id,r.from_object_id as person,r.to_object_id as organisation,r.predicate,r.state from public.relationship r
  where r.predicate in('educated_at','employed_by')
   and r.origin_key='reviewed-career-v1:'||r.predicate||':'||r.from_object_id::text||':'||r.to_object_id::text
  order by r.id limit 5001`;
 if(edges.length>5000)throw new Error('CAREER_EDGE_LIMIT');
 const byId=new Map(candidates.map(candidate=>[candidate.id,candidate]));
 for(const candidate of candidates)candidate.completeFields=[...new Set([...(candidate.completeFields??[]),...filters.map(row=>row.field)])];
 for(const edge of edges){
  const candidate=byId.get(edge.person);if(!candidate||edge.state!=='active')continue;
  if(edge.id!==migrationId(careerOrigin(edge.person,edge.organisation,edge.predicate)))throw new Error('CAREER_EDGE_CONFLICT');
  const proof=(await careerProofs(sql,edge.id)).find(row=>row.current);if(!proof)continue;
  const matching=resolved.filter(({filter,organisation})=>organisation?filter.field===edge.predicate&&organisation.id===edge.organisation:
   edge.predicate==='educated_at'&&proof.fieldOfStudy&&relationshipName(proof.fieldOfStudy)===relationshipName(filter.value));
  if(!matching.length)continue;
  const evidenceId=`relationship:${edge.id}:object:${candidate.id}`;
  candidate.evidence.push({id:evidenceId,objectId:candidate.id,text:proof.reason,layer:'user',verified:true,filterOnly:true,
   provenance:{observationId:proof.id,supportStatus:'owner_reviewed',relationship:{id:edge.id,predicate:edge.predicate,
    organisationId:edge.organisation,organisationLabel:proof.expectedOrganisation,...(proof.fieldOfStudy?{fieldOfStudy:proof.fieldOfStudy}:{})}}});
  for(const {filter} of matching)candidate.facts.push({...filter,evidenceId});
 }
}
