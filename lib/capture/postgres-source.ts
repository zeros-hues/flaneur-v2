import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type { CaptureSourcePlan } from "./source-plan";

export interface CaptureSourceResolution {artifactId:string|null;state:"created"|"matched"|"unresolved";reason:string|null}
/** Called only in the save transaction. Existing retired/conflicting identities never reactivate or silently rebind. */
export async function resolveCaptureSource(sql:postgres.TransactionSql,plan:CaptureSourcePlan,receivedAt:Date):Promise<CaptureSourceResolution>{
 // Observation/review writers use this same graph lock. Acquire it before source and Artifact rows.
 await sql`select pg_advisory_xact_lock(1790703955, 1)`;
 const [existing]=await sql`select i.object_id,i.canonical_url,i.resolution_layer,i.assertion_id,r.kind,r.archived_at,
   a.type,a.source_url,a.migration_key,exists(select 1 from public.object_alias alias where alias.former_object_id=i.object_id) as aliased
   from public.source_identity i join public.object_ref r on r.id=i.object_id left join public.artifact a on a.id=i.object_id
   where i.adapter_id='linkedin' and i.identity_kind=${plan.identityKind} and i.external_key=${plan.externalKey}`;
 if(existing){
  if(existing.archived_at!==null||existing.aliased)return {artifactId:null,state:"unresolved",reason:"registered_source_inactive"};
  if(existing.kind!=="artifact"||existing.type!==plan.type||existing.source_url!==plan.sourceUrl||existing.canonical_url!==plan.sourceUrl||
    existing.migration_key!==plan.migrationKey||existing.resolution_layer!=="extracted"||existing.assertion_id!==null)
   return {artifactId:null,state:"unresolved",reason:"registered_source_conflict"};
  await sql`update public.artifact set last_captured_at=greatest(coalesce(last_captured_at,captured_at),${receivedAt}) where id=${existing.object_id}`;
  return {artifactId:existing.object_id,state:"matched",reason:null};
 }
 const id=randomUUID();
 await sql`insert into public.artifact(id,type,source_url,migration_key,captured_at,last_captured_at)
   values(${id},${plan.type},${plan.sourceUrl},${plan.migrationKey},${receivedAt},${receivedAt})`;
 await sql`insert into public.source_identity(object_id,adapter_id,identity_kind,external_key,canonical_url,resolution_layer)
   values(${id},'linkedin',${plan.identityKind},${plan.externalKey},${plan.sourceUrl},'extracted')`;
 return {artifactId:id,state:"created",reason:null};
}
