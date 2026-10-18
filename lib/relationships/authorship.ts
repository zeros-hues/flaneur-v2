import {z} from 'zod';
import type postgres from 'postgres';
import {migrationId} from '../migration/identity';
import {canonical} from '../migration/batch';
import {withDependencyTransaction,invalidateDependencies} from '../processing/postgres-dependencies';

const uuid=z.uuid().transform(value=>value.toLowerCase());
const reason=z.string().min(1).max(2000).refine(value=>!!value.trim()&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value));
const fields={requestId:uuid,snapshotId:uuid,personId:uuid,reason};
export const authorshipDecision=z.discriminatedUnion('decision',[
 z.object({...fields,decision:z.literal('confirm')}).strict(),
 z.object({...fields,decision:z.literal('reject'),observationId:uuid}).strict(),
]);
type Tx=postgres.TransactionSql;
export const authorshipOrigin=(artifactId:string,personId:string)=>`reviewed-authorship-v1:${artifactId}:${personId}`;

/** A source is eligible only through its explicit, still-current v2 capture/Encounter link. */
export async function authorshipCapture(sql:Tx,snapshotId:string){
 const rows=await sql`select a.id as artifact_id,e.id as encounter_id from public.snapshot s
  join public.artifact a on a.id=s.artifact_id and a.type='social_post' and a.migration_key like 'capture-source-v1:%'
  join public.object_ref ar on ar.id=a.id and ar.archived_at is null
  join public.capture_request c on c.snapshot_id=s.id
  join public.encounter e on e.id=c.encounter_id and e.snapshot_id=s.id and e.kind='captured'
  join public.object_ref er on er.id=e.id and er.archived_at is null
  where s.id=${snapshotId} and s.capture_type='post' and s.adapter_id='linkedin' and s.content_hash is not null
   and exists(select 1 from public.encounter_object x where x.encounter_id=e.id and x.object_id=a.id and x.relation='source')
   and not exists(select 1 from public.object_alias alias where alias.former_object_id in(a.id,e.id))`;
 return rows.length===1?{artifactId:rows[0]!.artifact_id as string,encounterId:rows[0]!.encounter_id as string}:null;
}

/** Includes immutable history; current support is revalidated, never inferred from raw edge state. */
export async function authorshipAssertions(sql:Tx,artifactId:string){
 const rows=await sql`select o.id,o.body_text as reason,o.structured_value->>'snapshot_id' as snapshot_id,
  r.id as relationship_id,r.to_object_id as person_id,r.state,p.name,
  (select review.comment from public.observation_review review where review.observation_id=o.id
   and review.decision='rejected' order by review.reviewed_at desc,review.id desc limit 1) as withdrawal,
  (oref.archived_at is null and pref.archived_at is null
   and not exists(select 1 from public.object_alias alias where alias.former_object_id in(o.id,p.id))
   and not exists(select 1 from public.observation_review review where review.observation_id=o.id)
   and not exists(select 1 from public.observation newer where newer.supersedes_id=o.id)) as current
  from public.relationship r join public.relationship_support support on support.relationship_id=r.id
  join public.observation o on o.id=support.observation_id join public.object_ref oref on oref.id=o.id
  join public.person p on p.id=r.to_object_id join public.object_ref pref on pref.id=p.id
  where r.from_object_id=${artifactId} and r.predicate='authored_by'
   and r.origin_key='reviewed-authorship-v1:'||r.from_object_id::text||':'||r.to_object_id::text
   and o.subject_id=r.from_object_id and o.truth_layer='user' and o.semantic_role='relationship_assertion'
   and o.field_key='reviewed_authorship' and o.support_status='partial'
   and o.structured_value->>'predicate'='authored_by' and o.structured_value->>'to_object_id'=r.to_object_id::text
   and o.origin_key='reviewed-authorship-decision-v1:'||(o.structured_value->'request'->>'requestId')
  order by o.id limit 201`;
 if(rows.length>200)throw new Error('AUTHORSHIP_INSPECTION_LIMIT');
 const captures=new Map<string,Awaited<ReturnType<typeof authorshipCapture>>>();
 const result=[];
 for(const row of rows){
  const snapshot=z.uuid().safeParse(row.snapshot_id);if(!snapshot.success)continue;
  if(!captures.has(snapshot.data))captures.set(snapshot.data,await authorshipCapture(sql,snapshot.data));
  const capture=captures.get(snapshot.data);
  if(row.relationship_id!==migrationId(authorshipOrigin(artifactId,row.person_id)))continue;
  let withdrawalReason:string|null=null;
  try{const decision=authorshipDecision.safeParse(JSON.parse(row.withdrawal));
   if(decision.success&&decision.data.decision==='reject'&&decision.data.observationId===row.id&&decision.data.snapshotId===snapshot.data&&decision.data.personId===row.person_id)
    withdrawalReason=decision.data.reason;
  }catch{/* Unrelated or legacy reviews are not interpreted as this service's receipts. */}
  result.push({id:row.id as string,personId:row.person_id as string,name:(row.name as string).slice(0,180),
   snapshotId:snapshot.data,encounterId:capture?.encounterId??null,relationshipId:row.relationship_id as string,
   state:row.state as string,reason:row.reason as string,withdrawalReason,current:!!row.current&&capture?.artifactId===artifactId});
 }
 return result;
}

export function postgresAuthorshipStore(connection:ReturnType<typeof postgres>){
 return {async decide(raw:unknown){
  const input=authorshipDecision.parse(raw),origin=`reviewed-authorship-decision-v1:${input.requestId}`;
  const id=migrationId(origin),reviewId=migrationId(`${origin}:review`);
  return withDependencyTransaction(connection,async()=>input.decision==='reject'?[input.observationId]:[],
   async sql=>{
    const [source]=await sql`select artifact_id from public.snapshot where id=${input.snapshotId}`;
    return [input.personId,source?.artifact_id].filter((value):value is string=>typeof value==='string')
     .flatMap(value=>[`enrich:object:${value}`,`index:object:${value}`]);
   },async(sql,dependencies)=>{
    // Receipts precede current-state guards: retrying an old decision never reactivates it.
    const [proof]=await sql`select id,structured_value from public.observation where id=${id}`;
    const [review]=await sql`select observation_id,comment from public.observation_review where id=${reviewId}`;
    if(proof||review){
     if(input.decision==='confirm'&&proof&&!review&&canonical(proof.structured_value?.request)===canonical(input))
      return {requestId:input.requestId,snapshotId:input.snapshotId,personId:input.personId,observationId:id,replayed:true};
     if(input.decision==='reject'&&review&&!proof&&review.observation_id===input.observationId&&review.comment===canonical(input))
      return {requestId:input.requestId,snapshotId:input.snapshotId,personId:input.personId,observationId:input.observationId,replayed:true};
     throw new Error('AUTHORSHIP_REQUEST_CONFLICT');
    }
    const capture=await authorshipCapture(sql,input.snapshotId);
    const [person]=await sql`select r.id from public.object_ref r where r.id=${input.personId} and r.kind='person' and r.archived_at is null
     and not exists(select 1 from public.object_alias alias where alias.former_object_id=r.id)`;
    if(!capture||!person)throw new Error('AUTHORSHIP_TARGET_UNAVAILABLE');
    const edgeOrigin=authorshipOrigin(capture.artifactId,input.personId),edgeId=migrationId(edgeOrigin);
    const [edge]=await sql`select id,origin_key,state from public.relationship where from_object_id=${capture.artifactId}
     and to_object_id=${input.personId} and predicate='authored_by'`;
    if(edge&&(edge.id!==edgeId||edge.origin_key!==edgeOrigin||edge.state==='rejected'))throw new Error('AUTHORSHIP_TARGET_UNAVAILABLE');
    const assertions=await authorshipAssertions(sql,capture.artifactId);
    const current=assertions.filter(row=>row.current&&row.personId===input.personId&&row.snapshotId===input.snapshotId);
    if(input.decision==='confirm'){
     if(current.length)throw new Error('AUTHORSHIP_STALE');
     await sql`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,structured_value,field_key,support_status,origin_key)
      values(${id},${capture.artifactId},'user','relationship_assertion',${input.reason},
       ${sql.json({predicate:'authored_by',to_object_id:input.personId,snapshot_id:input.snapshotId,request:input})},'reviewed_authorship','partial',${origin})`;
     await sql`insert into public.relationship(id,from_object_id,to_object_id,predicate,state,origin_key)
      values(${edgeId},${capture.artifactId},${input.personId},'authored_by','candidate',${edgeOrigin}) on conflict do nothing`;
     await sql`insert into public.relationship_support(relationship_id,observation_id)values(${edgeId},${id})`;
    }else{
     if(current.length!==1||current[0]!.id!==input.observationId)throw new Error('AUTHORSHIP_STALE');
     await sql`insert into public.observation_review(id,observation_id,decision,comment)
      values(${reviewId},${input.observationId},'rejected',${canonical(input)})`;
    }
    await invalidateDependencies(sql,dependencies,input.decision==='confirm'?id:reviewId);
    const supported=(await authorshipAssertions(sql,capture.artifactId)).some(row=>row.personId===input.personId&&row.current);
    await sql`update public.relationship set state=${supported?'active':'candidate'} where id=${edgeId} and state<>'rejected'`;
    return {requestId:input.requestId,snapshotId:input.snapshotId,personId:input.personId,
     observationId:input.decision==='confirm'?id:input.observationId,replayed:false};
   });
 }};
}
