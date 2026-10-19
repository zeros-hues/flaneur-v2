import type postgres from 'postgres';
import type {Evidence} from '../retrieval/evidence';
import {trajectoryDecision,trajectoryOrder,TRAJECTORY_VERSION,type TrajectoryDecision} from './trajectory';
import {migrationId} from '../migration/identity';
import {canonical} from '../migration/batch';
import {withDependencyTransaction,invalidateDependencies} from '../processing/postgres-dependencies';
const origin=(id:string)=>`${TRAJECTORY_VERSION}:${id}`;
const candidateText=(v:Extract<TrajectoryDecision,{decision:'candidate'}>)=>`Possible path: ${v.from.label} → ${v.to.label}. Chronology alone does not establish a transition.`;
function candidateCovered(input:Extract<TrajectoryDecision,{decision:'candidate'}>,evidence:Evidence[]){
 const covers=(endpoint:typeof input.from,period:typeof input.chronology.from)=>evidence.some(e=>e.text.includes(endpoint.label)&&
  [period.start,period.end].filter(Boolean).length>0&&[period.start,period.end].filter(Boolean).every(date=>e.text.includes(date!)));
 return covers(input.from,input.chronology.from)&&covers(input.to,input.chronology.to);
}
/** Reuse actual current evidence/identity/locator checks. No trajectory filter, so no recursive trajectory read. */
export async function trajectorySupports(sql:postgres.TransactionSql,personId:string,ids:string[]){
 if(!ids.length)return [] as Evidence[];
 const rows=await sql`select id from public.observation where id=any(${ids}) and subject_id=${personId}
  and field_key is distinct from 'reviewed_trajectory'`;
 if(rows.length!==ids.length)return null;
 const {readRetrievalTransaction}=await import('../retrieval/postgres-reader');
 const data=await readRetrievalTransaction(sql,{mode:'recall',terms:[],constraints:[],objectKinds:['person']});
 const evidence=data.output.candidates.find(v=>v.id===personId)?.evidence??[];
 const selected=ids.map(id=>evidence.find(v=>v.provenance?.observationId===id&&v.verified&&v.layer!=='inferred'));
 return selected.every(Boolean)?selected as Evidence[]:null;
}
export async function trajectoryClaims(sql:postgres.TransactionSql,personId:string){
 const rows=await sql`select o.id,o.body_text as text,o.truth_layer as layer,o.structured_value->'request' as request,
  o.structured_value->>'version' as version,o.supersedes_id as supersedes,o.recorded_at::text as "recordedAt",
  (r.archived_at is null and p.archived_at is null
   and not exists(select 1 from public.object_alias a where a.former_object_id in(o.id,o.subject_id))
   and not exists(select 1 from public.observation_review v where v.observation_id=o.id)
   and not exists(select 1 from public.observation n where n.supersedes_id=o.id)) as eligible
  from public.observation o join public.object_ref r on r.id=o.id join public.object_ref p on p.id=o.subject_id and p.kind='person'
  where o.subject_id=${personId} and o.field_key='reviewed_trajectory' and o.semantic_role='relationship_assertion'
   and o.support_status='partial' and o.origin_key=${TRAJECTORY_VERSION+':'}||(o.structured_value->'request'->>'requestId') order by o.id limit 201`;
 if(rows.length>200)throw new Error('TRAJECTORY_HISTORY_LIMIT');
 const result=[];
 for(const row of rows){
  const parsed=trajectoryDecision.safeParse(row.request);
  if(!parsed.success||!('from' in parsed.data))continue;
  const claim=parsed.data;
  if(claim.personId!==personId||row.version!==TRAJECTORY_VERSION||row.id!==migrationId(origin(claim.requestId))
   ||row.text!==(claim.decision==='candidate'?candidateText(claim):claim.reason)
   ||row.layer!==(claim.decision==='candidate'?'inferred':'user')
   ||(claim.decision==='correct'&&row.supersedes!==claim.observationId)
   ||(claim.decision==='confirm'&&row.supersedes!==(claim.candidateId??null)))continue;
  const concepts=await sql`select c.id,c.label,c.kind from public.concept c join public.object_ref r on r.id=c.id and r.archived_at is null
   where c.id in(${claim.from.id},${claim.to.id}) and not exists(select 1 from public.object_alias a where a.former_object_id=c.id)`;
  const meanings=[claim.from,claim.to].every(v=>concepts.some(c=>c.id===v.id&&c.label===v.label&&c.kind===v.kind));
  const supportRows=await sql`select supporting_observation_id as id from public.observation_evidence
   where observation_id=${row.id} and support_role='supports' and evidence_version=${TRAJECTORY_VERSION} order by supporting_observation_id`;
  const linked=canonical(supportRows.map(v=>v.id).sort())===canonical([...claim.supportingObservationIds].sort());
  const evidence=linked?await trajectorySupports(sql,personId,claim.supportingObservationIds):null;
  const reviews=await sql<{id:string;decision:string;comment:string|null;replacementId:string|null;reviewedAt:string}[]>`select id,decision,comment,replacement_observation_id as "replacementId",reviewed_at::text as "reviewedAt"
   from public.observation_review where observation_id=${row.id} order by reviewed_at,id limit 201`;
  if(reviews.length>200)throw new Error('TRAJECTORY_REVIEW_LIMIT');
  const current=!!row.eligible&&meanings&&!!evidence&&(claim.decision!=='candidate'||candidateCovered(claim,evidence!));
  result.push({id:row.id as string,claim,layer:row.layer as 'user'|'inferred',text:row.text as string,recordedAt:row.recordedAt as string,
   order:trajectoryOrder(claim.chronology),reviewable:!!row.eligible,current,confirmed:current&&claim.decision!=='candidate',
   evidence:evidence??[],reviews:reviews.map(v=>({...v,comment:decodeReview(v.comment,personId,row.id)}))});
 }
 return result;
}
function decodeReview(comment:unknown,person:string,id:unknown){
 try{const v=trajectoryDecision.safeParse(JSON.parse(String(comment)));if(v.success&&v.data.personId===person&&'observationId' in v.data&&v.data.observationId===id)return v.data.reason;
  if(v.success&&v.data.decision==='confirm'&&v.data.personId===person&&v.data.candidateId===id)return v.data.reason;}catch{}
 return null;
}
export function postgresTrajectoryStore(connection:ReturnType<typeof postgres>){return {async decide(raw:unknown){
 // Normalize absent optional fields identically before storing and on retries.
 const input=trajectoryDecision.parse(JSON.parse(JSON.stringify(raw))),key=origin(input.requestId),id=migrationId(key),reviewId=migrationId(`${key}:review`);
 const replaced='observationId' in input?input.observationId:input.decision==='confirm'?input.candidateId:undefined;
 return withDependencyTransaction(connection,async()=>replaced?[replaced]:[],
  [`enrich:object:${input.personId}`,`index:object:${input.personId}`],async(sql,dependencies)=>{
   const [proof]=await sql`select structured_value from public.observation where id=${id}`;
   const [review]=await sql`select comment from public.observation_review where id=${reviewId}`;
   if(proof||review){
    if('from' in input&&proof&&canonical(proof.structured_value?.request)===canonical(input))return {observationId:id,replayed:true};
    if(!('from' in input)&&review&&review.comment===canonical(input))return {observationId:input.observationId,replayed:true};
    throw new Error('TRAJECTORY_REQUEST_CONFLICT');
   }
   const [person]=await sql`select id from public.object_ref r where id=${input.personId} and kind='person' and archived_at is null
    and not exists(select 1 from public.object_alias a where a.former_object_id=r.id)`;
   if(!person)throw new Error('TRAJECTORY_TARGET_UNAVAILABLE');
   const claims=await trajectoryClaims(sql,input.personId),old=replaced?claims.find(v=>v.id===replaced):null;
   if(replaced&&(!old?.reviewable||('from' in input&&!old.current)||(input.decision==='correct'&&!old.confirmed)))throw new Error('TRAJECTORY_STALE');
   if('from' in input){
    if(claims.length>=200)throw new Error('TRAJECTORY_HISTORY_LIMIT');
    const concepts=await sql`select c.id,c.label,c.kind from public.concept c join public.object_ref r on r.id=c.id and r.archived_at is null
     where c.id in(${input.from.id},${input.to.id}) and not exists(select 1 from public.object_alias a where a.former_object_id=c.id)`;
    if(![input.from,input.to].every(v=>concepts.some(c=>c.id===v.id&&c.label===v.label&&c.kind===v.kind)))throw new Error('TRAJECTORY_STALE');
    if(input.decision==='confirm'&&input.candidateId){
     if(old?.claim.decision!=='candidate'||canonical({from:old.claim.from,to:old.claim.to,chronology:old.claim.chronology,supports:old.claim.supportingObservationIds})!==
      canonical({from:input.from,to:input.to,chronology:input.chronology,supports:input.supportingObservationIds}))throw new Error('TRAJECTORY_STALE');
    }
    const evidence=await trajectorySupports(sql,input.personId,input.supportingObservationIds);if(!evidence)throw new Error('TRAJECTORY_SUPPORT_UNAVAILABLE');
    if(input.decision==='candidate'){
     // An opt-in proposal must cite its actual dated inputs. It never confirms a move.
     if(!candidateCovered(input,evidence))throw new Error('TRAJECTORY_SUPPORT_UNAVAILABLE');
    }
    await sql`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,structured_value,field_key,support_status,origin_key,supersedes_id)
     values(${id},${input.personId},${input.decision==='candidate'?'inferred':'user'},'relationship_assertion',${input.decision==='candidate'?candidateText(input):input.reason},
      ${sql.json({version:TRAJECTORY_VERSION,request:input})},'reviewed_trajectory','partial',${key},${replaced??null})`;
    for(const supporting of input.supportingObservationIds)await sql`insert into public.observation_evidence(observation_id,supporting_observation_id,support_role,evidence_version)
     values(${id},${supporting},'supports',${TRAJECTORY_VERSION})`;
    if(replaced)await sql`insert into public.observation_review(id,observation_id,decision,replacement_observation_id,comment)
     values(${reviewId},${replaced},${input.decision==='correct'?'corrected':'confirmed'},${id},${canonical(input)})`;
   }else{
    await sql`insert into public.observation_review(id,observation_id,decision,comment)values(${reviewId},${input.observationId},'rejected',${canonical(input)})`;
    if(input.decision==='archive')await sql`update public.object_ref set archived_at=now() where id=${input.observationId}`;
   }
   await invalidateDependencies(sql,dependencies,'from' in input?id:reviewId);
   return {observationId:'from' in input?id:input.observationId,replayed:false};
  });
 }};}
