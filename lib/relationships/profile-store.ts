import type postgres from 'postgres';
import {migrationId} from '../migration/identity';
import {canonical} from '../migration/batch';
import {eligibleProfileProofs,profileEdgeView,type ProfileProof,type ProfileSupport} from './profile-policy';
type Tx=postgres.TransactionSql;
export const profileOrigin=(artifactId:string,personId:string)=>`reviewed-profile-v1:${artifactId}:${personId}`;
export async function currentProfileProofs(sql:Tx,artifactId:string){
 const rows=await sql<ProfileProof[]>`select o.id as "observationId",o.subject_id as "personId",s.id as "snapshotId",e.id as "encounterId",
  o.truth_layer as layer,o.origin_key as "originKey",array(select x.object_id::text from public.encounter_object x
   join public.object_ref r on r.id=x.object_id where x.encounter_id=e.id and x.relation='noticed' and r.kind='person' order by x.object_id) as "noticedPeople"
  from public.snapshot s join public.artifact a on a.id=s.artifact_id
  join public.object_ref ar on ar.id=a.id and ar.archived_at is null
  join public.capture_request request on request.snapshot_id=s.id
  join public.encounter e on e.id=request.encounter_id and e.snapshot_id=s.id
  join public.object_ref er on er.id=e.id and er.archived_at is null
  join public.observation o on o.structured_value->>'identity_for_snapshot'=s.id::text and o.field_key='identity_for_snapshot'
  join public.object_ref p on p.id=o.subject_id and p.kind='person' and p.archived_at is null
  join public.object_ref proof on proof.id=o.id and proof.archived_at is null
  where a.id=${artifactId} and a.type='profile_page' and a.migration_key like 'capture-source-v1:%'
   and s.capture_type='profile' and s.adapter_id='linkedin' and s.content_hash is not null
   and o.truth_layer in ('user','source','extracted') and o.support_status='verified'
   and not exists(select 1 from public.object_alias alias where alias.former_object_id in(a.id,e.id,o.id,o.subject_id))
   and not exists(select 1 from public.observation_review review where review.observation_id=o.id)
   and not exists(select 1 from public.observation newer where newer.supersedes_id=o.id)
   and exists(select 1 from public.encounter_object x where x.encounter_id=e.id and x.object_id=a.id and x.relation='source')
  order by s.id,o.id limit 1001`;
 if(rows.length>1000)throw new Error('PROFILE_RELATIONSHIP_LIMIT');return rows;
}
export async function currentProfileSupports(sql:Tx,artifactId:string){
 const rows=await sql<ProfileSupport[]>`select r.id as "relationshipId",o.id as "assertionId",o.structured_value->>'identity_observation_id' as "proofId",
  o.structured_value->>'snapshot_id' as "snapshotId",r.to_object_id as "personId"
  from public.relationship r join public.relationship_support support on support.relationship_id=r.id
  join public.observation o on o.id=support.observation_id join public.object_ref ref on ref.id=o.id and ref.archived_at is null
  where r.from_object_id=${artifactId} and r.predicate='profile_of'
   and r.origin_key='reviewed-profile-v1:'||r.from_object_id::text||':'||r.to_object_id::text
   and o.subject_id=r.from_object_id and o.truth_layer='extracted' and o.semantic_role='relationship_assertion' and o.support_status='partial'
   and o.structured_value->>'to_object_id'=r.to_object_id::text and o.structured_value->>'predicate'='profile_of'
   and o.origin_key='reviewed-profile-assertion-v1:'||(o.structured_value->>'identity_observation_id')
   and exists(select 1 from public.observation_evidence e where e.observation_id=o.id and e.supporting_observation_id::text=o.structured_value->>'identity_observation_id' and e.support_role='supports')
   and not exists(select 1 from public.object_alias alias where alias.former_object_id=o.id)
   and not exists(select 1 from public.observation_review review where review.observation_id=o.id)
   and not exists(select 1 from public.observation newer where newer.supersedes_id=o.id)
  order by r.id,o.id limit 1001`;
 if(rows.length>1000)throw new Error('PROFILE_RELATIONSHIP_LIMIT');return rows;
}
/** Called only inside an explicit identity decision, with its graph lock already held. No historical backfill. */
export async function syncReviewedProfile(sql:Tx,snapshotId:string){
 const [source]=await sql`select a.id from public.snapshot s join public.artifact a on a.id=s.artifact_id
  where s.id=${snapshotId} and a.type='profile_page' and a.migration_key like 'capture-source-v1:%'`;
 if(!source)return;
 const proofs=await currentProfileProofs(sql,source.id);
 for(const proof of eligibleProfileProofs(proofs).filter(row=>row.snapshotId===snapshotId&&row.layer==='user'&&row.originKey?.startsWith('identity-confirmation:'))){
  const origin=profileOrigin(source.id,proof.personId),id=migrationId(origin);
  await sql`insert into public.relationship(id,from_object_id,to_object_id,predicate,state,origin_key)
   values(${id},${source.id},${proof.personId},'profile_of','candidate',${origin}) on conflict do nothing`;
  const [edge]=await sql`select id,origin_key from public.relationship where from_object_id=${source.id} and to_object_id=${proof.personId} and predicate='profile_of'`;
  if(edge?.id!==id||edge.origin_key!==origin)continue; // Never adopt or overwrite a legacy endpoint collision.
  const assertionOrigin=`reviewed-profile-assertion-v1:${proof.observationId}`,assertionId=migrationId(assertionOrigin);
  const structured={predicate:'profile_of',to_object_id:proof.personId,identity_observation_id:proof.observationId,snapshot_id:proof.snapshotId};
  const body='A captured profile was associated with this Person by owner confirmation.';
  await sql`insert into public.observation(id,subject_id,truth_layer,semantic_role,body_text,structured_value,field_key,support_status,origin_key)
   values(${assertionId},${source.id},'extracted','relationship_assertion',${body},${sql.json(structured)},'reviewed_profile','partial',${assertionOrigin}) on conflict do nothing`;
  const [assertion]=await sql`select subject_id,truth_layer,semantic_role,body_text,structured_value,field_key,support_status,origin_key from public.observation where id=${assertionId}`;
  if(!assertion||assertion.subject_id!==source.id||assertion.truth_layer!=='extracted'||assertion.semantic_role!=='relationship_assertion'||
   assertion.body_text!==body||assertion.field_key!=='reviewed_profile'||assertion.support_status!=='partial'||assertion.origin_key!==assertionOrigin||
   canonical(assertion.structured_value)!==canonical(structured))throw new Error('PROFILE_RELATIONSHIP_CONFLICT');
  await sql`insert into public.observation_evidence(id,observation_id,supporting_observation_id,support_role,evidence_version)
   values(${migrationId(`${assertionOrigin}:dependency`)},${assertionId},${proof.observationId},'supports','reviewed-profile-v1') on conflict do nothing`;
  await sql`insert into public.relationship_support(relationship_id,observation_id)values(${id},${assertionId}) on conflict do nothing`;
 }
 const edges=await sql<{id:string;personId:string;state:string}[]>`select id,to_object_id as "personId",state from public.relationship
  where from_object_id=${source.id} and predicate='profile_of' and origin_key='reviewed-profile-v1:'||from_object_id::text||':'||to_object_id::text order by id limit 1001`;
 if(edges.length>1000)throw new Error('PROFILE_RELATIONSHIP_LIMIT');
 const supports=await currentProfileSupports(sql,source.id);
 for(const edge of edges)if(edge.state!=='rejected'&&edge.id===migrationId(profileOrigin(source.id,edge.personId))){
  const view=profileEdgeView({...edge,state:'active'},proofs,supports),state=view.state==='supported'?'active':'candidate';
  if(state!==edge.state)await sql`update public.relationship set state=${state} where id=${edge.id}`;
 }
}
