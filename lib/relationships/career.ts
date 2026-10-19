import {z} from 'zod';
import type postgres from 'postgres';
import {migrationId} from '../migration/identity';
import {canonical} from '../migration/batch';
import {withDependencyTransaction,invalidateDependencies} from '../processing/postgres-dependencies';
const uuid=z.uuid().transform(value=>value.toLowerCase());
const clean=(max:number)=>z.string().min(1).max(max).refine(value=>!!value.trim()&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value));
const base={requestId:uuid,personId:uuid,organisationId:uuid,predicate:z.enum(['educated_at','employed_by']),reason:clean(2000)};
export const careerDecision=z.discriminatedUnion('decision',[
 z.object({...base,decision:z.literal('confirm'),expectedOrganisation:clean(300),fieldOfStudy:clean(300).optional()}).strict()
  .refine(value=>value.predicate==='educated_at'||!value.fieldOfStudy),
 z.object({...base,decision:z.literal('reject'),observationId:uuid}).strict(),
]);
export const careerOrigin=(person:string,organisation:string,predicate:string)=>`reviewed-career-v1:${predicate}:${person}:${organisation}`;
/** Current meaning is checked on every read, independently of the materialized edge state. */
export async function careerProofs(sql:postgres.TransactionSql,edgeId:string){
 const rows=await sql`select o.id,o.body_text as reason,o.structured_value->'request' as request,r.state,
  org.display_name as label,r.from_object_id as person,r.to_object_id as organisation,r.predicate,
  (pr.archived_at is null and sr.archived_at is null and tr.archived_at is null
   and not exists(select 1 from public.object_alias a where a.former_object_id in(o.id,r.from_object_id,r.to_object_id))
   and not exists(select 1 from public.observation_review v where v.observation_id=o.id)
   and not exists(select 1 from public.observation n where n.supersedes_id=o.id)) as eligible,
  (select v.comment from public.observation_review v where v.observation_id=o.id and v.decision='rejected' order by v.reviewed_at desc,v.id desc limit 1) as withdrawal
  from public.relationship r join public.relationship_support s on s.relationship_id=r.id
  join public.observation o on o.id=s.observation_id join public.object_ref pr on pr.id=o.id
  join public.object_ref sr on sr.id=r.from_object_id and sr.kind='person'
  join public.object_ref tr on tr.id=r.to_object_id and tr.kind='organisation'
  join public.organisation org on org.id=tr.id
  where r.id=${edgeId} and r.predicate in('educated_at','employed_by')
   and r.origin_key='reviewed-career-v1:'||r.predicate||':'||r.from_object_id::text||':'||r.to_object_id::text
   and o.subject_id=r.from_object_id and o.truth_layer='user' and o.semantic_role='relationship_assertion'
   and o.support_status='partial' and o.field_key='reviewed_career'
   and o.structured_value->>'predicate'=r.predicate and o.structured_value->>'to_object_id'=r.to_object_id::text
   and o.origin_key='reviewed-career-decision-v1:'||(o.structured_value->'request'->>'requestId')
  order by o.id limit 201`;
 if(rows.length>200)throw new Error('CAREER_SUPPORT_LIMIT');
 const result=[];
 for(const row of rows){
  const parsed=careerDecision.safeParse(row.request);if(!parsed.success||parsed.data.decision!=='confirm')continue;
  const input=parsed.data;
  if(row.id!==migrationId(`reviewed-career-decision-v1:${input.requestId}`)||edgeId!==migrationId(careerOrigin(input.personId,input.organisationId,input.predicate))
   ||input.personId!==row.person||input.organisationId!==row.organisation||input.predicate!==row.predicate||input.reason!==row.reason)continue;
  let withdrawalReason:string|null=null;
  try{const v=careerDecision.safeParse(JSON.parse(row.withdrawal));if(v.success&&v.data.decision==='reject'&&v.data.observationId===row.id
   &&v.data.personId===input.personId&&v.data.organisationId===input.organisationId&&v.data.predicate===input.predicate)withdrawalReason=v.data.reason;}catch{}
  const withdrawable=!!row.eligible&&row.state!=='rejected';
  result.push({id:row.id as string,...input,withdrawalReason,withdrawable,current:withdrawable&&input.expectedOrganisation===row.label});
 }
 return result;
}
export function postgresCareerStore(connection:ReturnType<typeof postgres>){return {async decide(raw:unknown){
 const input=careerDecision.parse(raw);if(input.decision==='confirm'&&input.fieldOfStudy===undefined)delete input.fieldOfStudy;
 const origin=`reviewed-career-decision-v1:${input.requestId}`,id=migrationId(origin),reviewId=migrationId(`${origin}:review`);
 return withDependencyTransaction(connection,async()=>input.decision==='reject'?[input.observationId]:[],
  [input.personId,input.organisationId].flatMap(id=>[`enrich:object:${id}`,`index:object:${id}`]),async(sql,dependencies)=>{
   const [proof]=await sql`select structured_value from public.observation where id=${id}`;
   const [review]=await sql`select observation_id,comment from public.observation_review where id=${reviewId}`;
   if(proof||review){
    if(input.decision==='confirm'&&proof&&!review&&canonical(proof.structured_value?.request)===canonical(input))return {observationId:id,replayed:true};
    if(input.decision==='reject'&&review&&!proof&&review.observation_id===input.observationId&&review.comment===canonical(input))return {observationId:input.observationId,replayed:true};
    throw new Error('CAREER_REQUEST_CONFLICT');
   }
   const objects=await sql`select r.id,r.kind from public.object_ref r where r.id in(${input.personId},${input.organisationId}) and r.archived_at is null
    and not exists(select 1 from public.object_alias a where a.former_object_id=r.id)`;
   if(!objects.some(r=>r.id===input.personId&&r.kind==='person')||!objects.some(r=>r.id===input.organisationId&&r.kind==='organisation'))throw new Error('CAREER_TARGET_UNAVAILABLE');
   const [org]=await sql`select display_name from public.organisation where id=${input.organisationId}`;
   if(!org)throw new Error('CAREER_TARGET_UNAVAILABLE');
   if(input.decision==='confirm'&&org.display_name!==input.expectedOrganisation)throw new Error('CAREER_STALE');
   const edgeOrigin=careerOrigin(input.personId,input.organisationId,input.predicate),edgeId=migrationId(edgeOrigin);
   const [edge]=await sql`select id,origin_key,state from public.relationship where from_object_id=${input.personId} and to_object_id=${input.organisationId} and predicate=${input.predicate}`;
   if(edge&&(edge.id!==edgeId||edge.origin_key!==edgeOrigin||edge.state==='rejected'))throw new Error('CAREER_TARGET_UNAVAILABLE');
   const proofs=await careerProofs(sql,edgeId);
   if(input.decision==='confirm'){
    // One current statement per predicate/organisation. Change via explicit withdrawal, then confirmation.
    if(proofs.some(row=>row.current))throw new Error('CAREER_STALE');
    await sql`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,structured_value,field_key,support_status,origin_key)
     values(${id},${input.personId},'user','relationship_assertion',${input.reason},${sql.json({predicate:input.predicate,to_object_id:input.organisationId,request:input})},'reviewed_career','partial',${origin})`;
    await sql`insert into public.relationship(id,from_object_id,to_object_id,predicate,state,origin_key)
     values(${edgeId},${input.personId},${input.organisationId},${input.predicate},'candidate',${edgeOrigin}) on conflict do nothing`;
    await sql`insert into public.relationship_support(relationship_id,observation_id)values(${edgeId},${id})`;
   }else{
    if(!proofs.some(row=>row.id===input.observationId&&row.withdrawable))throw new Error('CAREER_STALE');
    await sql`insert into public.observation_review(id,observation_id,decision,comment)values(${reviewId},${input.observationId},'rejected',${canonical(input)})`;
   }
   await invalidateDependencies(sql,dependencies,input.decision==='confirm'?id:reviewId);
   const supported=(await careerProofs(sql,edgeId)).some(row=>row.current);
   await sql`update public.relationship set state=${supported?'active':'candidate'} where id=${edgeId} and state<>'rejected'`;
   return {observationId:input.decision==='confirm'?id:input.observationId,replayed:false};
  });
 }};}
