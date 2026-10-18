import type postgres from "postgres";
import type { Representation } from "../retrieval/representation";

/** Display projection only. Source evidence stays in each immutable representation; no authorship is inferred. */
export async function projectCapturedArtifact(sql:postgres.TransactionSql,source:Representation){
 await sql`select pg_advisory_xact_lock(1790703955, 1)`;
 await sql`update public.artifact a set body_text=${source.text}
   from public.snapshot s join public.capture_request request on request.snapshot_id=s.id
     join public.encounter e on e.id=request.encounter_id
     join public.object_ref er on er.id=e.id
   where s.id=${source.snapshotId} and a.id=s.artifact_id and a.migration_key like 'capture-source-v1:%'
     and er.archived_at is null and not exists(select 1 from public.object_alias alias where alias.former_object_id=e.id)
     and exists(select 1 from public.object_ref ar where ar.id=a.id and ar.kind='artifact' and ar.archived_at is null)
     and not exists(select 1 from public.object_alias alias where alias.former_object_id=a.id)
     and exists(select 1 from public.encounter_object x where x.encounter_id=e.id and x.object_id=a.id and x.relation='source')
     and not exists(select 1 from public.snapshot newer join public.capture_request next on next.snapshot_id=newer.id
       where newer.artifact_id=a.id and (next.received_at,newer.id)>(request.received_at,s.id))`;
}
