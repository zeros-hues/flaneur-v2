import type postgres from "postgres";
import type { CapturedIdentity } from "./inspection";
import {reassignmentInput} from './reassignment';

/** Shared eligibility for source-first review and the authoritative confirmation writer. */
export async function capturedProfileTransaction(sql:postgres.TransactionSql,snapshotId:string):Promise<CapturedIdentity|null>{
 const [row]=await sql`select s.id,s.source_url,s.adapter_id,s.capture_type,s.content_hash,
   to_char(s.captured_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as captured_at,
   (s.artifact_id is null or exists(select 1 from public.object_ref ar where ar.id=s.artifact_id and ar.archived_at is null
     and not exists(select 1 from public.object_alias a where a.former_object_id=ar.id))) as source_active,
   (not exists(select 1 from public.capture_request request where request.snapshot_id=s.id) or exists(
     select 1 from public.capture_request request join public.encounter_object x on x.encounter_id=request.encounter_id
       where request.snapshot_id=s.id and x.object_id=s.artifact_id and x.relation='source')) as source_linked
   from public.snapshot s where s.id=${snapshotId}`;
 if(!row)return null;
 const encounters=await sql`select e.id,r.archived_at is null and not exists(
   select 1 from public.object_alias a where a.former_object_id=e.id) as active
   from public.encounter e join public.object_ref r on r.id=e.id where e.snapshot_id=${snapshotId} and e.kind='captured' order by e.id limit 1001`;
 const noticed=await sql`select distinct x.object_id as id from public.encounter_object x
   join public.encounter e on e.id=x.encounter_id join public.object_ref r on r.id=x.object_id
   where e.snapshot_id=${snapshotId} and x.relation='noticed' and r.kind='person' order by x.object_id limit 1001`;
 const proofs=await sql<CapturedIdentity['activeProofs']>`select o.id,o.subject_id as "personId",o.truth_layer as layer,o.body_text as "bodyText",
   o.structured_value->'identity_reassignment' as reassignment
   from public.observation o join public.object_ref r on r.id=o.id join public.object_ref p on p.id=o.subject_id
   where o.field_key='identity_for_snapshot' and o.structured_value->>'identity_for_snapshot'=${snapshotId}
     and o.support_status='verified' and o.truth_layer in ('user','source','extracted') and r.archived_at is null
     and p.archived_at is null and p.kind='person'
     and not exists(select 1 from public.object_alias a where a.former_object_id in(o.id,o.subject_id))
     and not exists(select 1 from public.observation_review v where v.observation_id=o.id)
     and not exists(select 1 from public.observation n where n.supersedes_id=o.id) order by o.id limit 1001`;
 if(noticed.length>1000||proofs.length>1000||encounters.length>1000)throw new Error('IDENTITY_INSPECTION_LIMIT');
 return {snapshotId,sourceUrl:row.source_url,capturedAt:row.captured_at,adapterId:row.adapter_id,captureType:row.capture_type,
   hasContentHash:!!row.content_hash,capturedEncounters:encounters.length,noticedPeople:noticed.map(item=>item.id as string),
   activeProofs:proofs.map(proof=>{const parsed=reassignmentInput.safeParse(proof.reassignment);
     return {...proof,reassignment:parsed.success?parsed.data:null};}),
   available:!!row.source_active&&!!row.source_linked&&encounters.length===1&&!!encounters[0]?.active};
}
