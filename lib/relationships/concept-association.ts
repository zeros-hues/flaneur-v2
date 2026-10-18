import {z} from 'zod';
import type postgres from 'postgres';
import {migrationId} from '../migration/identity';
import {canonical} from '../migration/batch';
import {withDependencyTransaction,invalidateDependencies} from '../processing/postgres-dependencies';
const uuid=z.uuid().transform(value=>value.toLowerCase());
const text=z.string().min(1).max(2000).refine(value=>!!value.trim()&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value));
const fields={requestId:uuid,subjectId:uuid,conceptId:uuid,reason:text};
export const conceptDecision=z.discriminatedUnion('decision',[
 z.object({...fields,decision:z.literal('confirm'),expectedConcept:z.object({label:z.string().min(1).max(300),kind:z.enum(['concept','topic'])}).strict()}).strict(),
 z.object({...fields,decision:z.literal('reject'),observationId:uuid}).strict(),
]);
export const conceptAssociationOrigin=(subjectId:string,conceptId:string)=>`reviewed-concept-v1:${subjectId}:${conceptId}`;
type Tx=postgres.TransactionSql;
export async function conceptAssociationProofs(sql:Tx,edgeId:string){
 const rows=await sql`select o.id,o.body_text as reason,o.structured_value->'request' as request,r.state,
  (sr.archived_at is null and cr.archived_at is null and pr.archived_at is null
   and not exists(select 1 from public.object_alias alias where alias.former_object_id in(o.id,r.from_object_id,r.to_object_id))
   and not exists(select 1 from public.observation_review review where review.observation_id=o.id)
   and not exists(select 1 from public.observation newer where newer.supersedes_id=o.id)) as eligible,
  c.label,c.kind,(select review.comment from public.observation_review review where review.observation_id=o.id and review.decision='rejected'
   order by review.reviewed_at desc,review.id desc limit 1) as withdrawal
  from public.relationship r join public.relationship_support support on support.relationship_id=r.id
  join public.observation o on o.id=support.observation_id join public.object_ref pr on pr.id=o.id
  join public.object_ref sr on sr.id=r.from_object_id and sr.kind in('person','artifact')
  join public.object_ref cr on cr.id=r.to_object_id and cr.kind='concept' join public.concept c on c.id=cr.id
  where r.id=${edgeId} and r.predicate='associated_with_concept' and o.subject_id=r.from_object_id
   and r.origin_key='reviewed-concept-v1:'||r.from_object_id::text||':'||r.to_object_id::text
   and o.truth_layer='user' and o.semantic_role='relationship_assertion' and o.support_status='partial' and o.field_key='reviewed_concept'
   and o.structured_value->>'predicate'='associated_with_concept' and o.structured_value->>'to_object_id'=r.to_object_id::text
   and o.origin_key='reviewed-concept-decision-v1:'||(o.structured_value->'request'->>'requestId')
  order by o.id limit 201`;
 if(rows.length>200)throw new Error('CONCEPT_ASSOCIATION_LIMIT');
 const result=[];
 for(const row of rows){
  const parsed=conceptDecision.safeParse(row.request);if(!parsed.success||parsed.data.decision!=='confirm')continue;
  const input=parsed.data,origin=`reviewed-concept-decision-v1:${input.requestId}`;
  if(row.id!==migrationId(origin)||edgeId!==migrationId(conceptAssociationOrigin(input.subjectId,input.conceptId))||row.reason!==input.reason)continue;
  let withdrawalReason:string|null=null;
  try{const review=conceptDecision.safeParse(JSON.parse(row.withdrawal));
   if(review.success&&review.data.decision==='reject'&&review.data.observationId===row.id&&review.data.subjectId===input.subjectId&&review.data.conceptId===input.conceptId)
    withdrawalReason=review.data.reason;
  }catch{/* Unrelated reviews are not decoded as receipts. */}
  const available=!!row.eligible&&row.state!=='rejected';
  result.push({id:row.id as string,subjectId:input.subjectId,conceptId:input.conceptId,reason:input.reason,
   conceptAtDecision:input.expectedConcept,withdrawalReason,withdrawable:available,
   current:available&&input.expectedConcept.label===row.label&&input.expectedConcept.kind===row.kind});
 }
 return result;
}
export function postgresConceptAssociationStore(connection:ReturnType<typeof postgres>){
 return {async decide(raw:unknown){
  const input=conceptDecision.parse(raw),origin=`reviewed-concept-decision-v1:${input.requestId}`,id=migrationId(origin),reviewId=migrationId(`${origin}:review`);
  return withDependencyTransaction(connection,async()=>input.decision==='reject'?[input.observationId]:[],
   [input.subjectId,input.conceptId].flatMap(value=>[`enrich:object:${value}`,`index:object:${value}`]),async(sql,dependencies)=>{
    const [proof]=await sql`select structured_value from public.observation where id=${id}`;
    const [review]=await sql`select observation_id,comment from public.observation_review where id=${reviewId}`;
    if(proof||review){
     if(input.decision==='confirm'&&proof&&!review&&canonical(proof.structured_value?.request)===canonical(input))
      return {requestId:input.requestId,subjectId:input.subjectId,conceptId:input.conceptId,observationId:id,replayed:true};
     if(input.decision==='reject'&&review&&!proof&&review.observation_id===input.observationId&&review.comment===canonical(input))
      return {requestId:input.requestId,subjectId:input.subjectId,conceptId:input.conceptId,observationId:input.observationId,replayed:true};
     throw new Error('CONCEPT_ASSOCIATION_REQUEST_CONFLICT');
    }
    const objects=await sql`select r.id,r.kind from public.object_ref r where r.id in(${input.subjectId},${input.conceptId}) and r.archived_at is null
     and not exists(select 1 from public.object_alias alias where alias.former_object_id=r.id)`;
    const subject=objects.find(row=>row.id===input.subjectId),target=objects.find(row=>row.id===input.conceptId);
    if(!subject||!['person','artifact'].includes(subject.kind)||target?.kind!=='concept')throw new Error('CONCEPT_ASSOCIATION_TARGET_UNAVAILABLE');
    const [concept]=await sql`select label,kind from public.concept where id=${input.conceptId}`;
    if(!concept)throw new Error('CONCEPT_ASSOCIATION_TARGET_UNAVAILABLE');
    if(input.decision==='confirm'&&(concept.label!==input.expectedConcept.label||concept.kind!==input.expectedConcept.kind))throw new Error('CONCEPT_ASSOCIATION_STALE');
    const edgeOrigin=conceptAssociationOrigin(input.subjectId,input.conceptId),edgeId=migrationId(edgeOrigin);
    const [edge]=await sql`select id,origin_key,state from public.relationship where from_object_id=${input.subjectId} and to_object_id=${input.conceptId} and predicate='associated_with_concept'`;
    if(edge&&(edge.id!==edgeId||edge.origin_key!==edgeOrigin||edge.state==='rejected'))throw new Error('CONCEPT_ASSOCIATION_TARGET_UNAVAILABLE');
    const proofs=await conceptAssociationProofs(sql,edgeId);
    if(input.decision==='confirm'){
     if(proofs.some(row=>row.current))throw new Error('CONCEPT_ASSOCIATION_STALE');
     await sql`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,structured_value,field_key,support_status,origin_key)
      values(${id},${input.subjectId},'user','relationship_assertion',${input.reason},
       ${sql.json({predicate:'associated_with_concept',to_object_id:input.conceptId,request:input})},'reviewed_concept','partial',${origin})`;
     await sql`insert into public.relationship(id,from_object_id,to_object_id,predicate,state,origin_key)
      values(${edgeId},${input.subjectId},${input.conceptId},'associated_with_concept','candidate',${edgeOrigin}) on conflict do nothing`;
     await sql`insert into public.relationship_support(relationship_id,observation_id)values(${edgeId},${id})`;
    }else{
     if(!proofs.some(row=>row.id===input.observationId&&row.withdrawable))throw new Error('CONCEPT_ASSOCIATION_STALE');
     await sql`insert into public.observation_review(id,observation_id,decision,comment)values(${reviewId},${input.observationId},'rejected',${canonical(input)})`;
    }
    await invalidateDependencies(sql,dependencies,input.decision==='confirm'?id:reviewId);
    const supported=(await conceptAssociationProofs(sql,edgeId)).some(row=>row.current);
    await sql`update public.relationship set state=${supported?'active':'candidate'} where id=${edgeId} and state<>'rejected'`;
    return {requestId:input.requestId,subjectId:input.subjectId,conceptId:input.conceptId,
     observationId:input.decision==='confirm'?id:input.observationId,replayed:false};
   });
 }};
}
