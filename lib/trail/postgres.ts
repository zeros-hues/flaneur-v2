import type postgres from "postgres";
import { z } from "zod";
import { inspectPersonTransaction } from "../review/postgres-inspection";

type Tx = postgres.TransactionSql;
export type TrailKind = "person" | "concept";
export interface TrailOptions { encounters?: string; artifacts?: string; observations?: string }
const cursor = (value?: string) => value ? z.uuid().parse(value).toLowerCase() : null;
interface EncounterRow { id: string; kind: string; occurredAt: string; context: string | null; clipped: boolean; direct: boolean }
interface ArtifactRow { id: string; type: string; text: string | null; clipped: boolean; capturedAt: string; association: string }
interface LinkRow { encounterId: string; id: string; kind: string; label: string; relation: string }

/** Actual query body is shared with rollback fixtures; the runtime wrapper enforces read-only isolation. */
export async function readTrailTransaction(tx: Tx, kind: TrailKind, rawId: string, options: TrailOptions = {}) {
  const id = z.uuid().parse(rawId).toLowerCase(), afterEncounter = cursor(options.encounters), afterArtifact = cursor(options.artifacts);
  const [root] = await tx`select r.archived_at is not null as archived, coalesce(p.name,c.label) as label, c.kind as "conceptKind"
    from public.object_ref r left join public.person p on p.id=r.id left join public.concept c on c.id=r.id
    where r.id=${id} and r.kind=${kind} and not exists(select 1 from public.object_alias a where a.former_object_id=r.id)`;
  if (!root) return null;
  const encounters = await tx<EncounterRow[]>`with eligible as (
    select e.*, exists(select 1 from public.encounter_object direct where direct.encounter_id=e.id and direct.object_id=${id}) as direct
    from public.encounter e join public.object_ref r on r.id=e.id where r.archived_at is null
      and not exists(select 1 from public.object_alias a where a.former_object_id=e.id)
      and (exists(select 1 from public.encounter_object x where x.encounter_id=e.id and x.object_id=${id})
        or (${kind}='concept' and exists(select 1 from public.encounter_object x
          join public.concept_link cl on cl.artifact_id=x.object_id join public.object_ref ar on ar.id=x.object_id
          where x.encounter_id=e.id and cl.concept_id=${id} and ar.archived_at is null
            and not exists(select 1 from public.object_alias a where a.former_object_id=ar.id))))
    ) select id,kind,to_char(occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "occurredAt",
      substring(explicit_context_text from 1 for 2000) as context,char_length(explicit_context_text)>2000 as clipped,direct
    from eligible where (${afterEncounter}::uuid is null or (occurred_at,id)<(select occurred_at,id from eligible where id=${afterEncounter}::uuid))
    order by occurred_at desc,id desc limit 21`;
  const selected = encounters.slice(0,20), ids = selected.map(row => row.id);
  const links = ids.length ? await tx<LinkRow[]>`select x.encounter_id as "encounterId",r.id,r.kind,x.relation,
    coalesce(p.name,c.label,substring(a.body_text from 1 for 180),a.type::text,r.kind) as label
    from public.encounter_object x join public.object_ref r on r.id=x.object_id
    left join public.person p on p.id=r.id left join public.concept c on c.id=r.id left join public.artifact a on a.id=r.id
    where x.encounter_id=any(${ids}::uuid[]) and r.id<>${id} and r.kind in ('person','artifact','concept') and r.archived_at is null
      and not exists(select 1 from public.object_alias former where former.former_object_id=r.id)
    order by x.encounter_id,r.id,x.relation limit 201` : [];
  if (links.length>200) throw new Error("TRAIL_LINK_LIMIT");
  const artifacts = await tx<ArtifactRow[]>`with eligible as (
    select a.*,case when ${kind}='concept' then cl.source::text when a.person_id=${id} then 'legacy_person' else 'recorded_encounter' end as association
    from public.artifact a join public.object_ref r on r.id=a.id
      left join public.concept_link cl on cl.artifact_id=a.id and cl.concept_id=${id}
    where r.archived_at is null and not exists(select 1 from public.object_alias former where former.former_object_id=r.id)
      and ((${kind}='concept' and cl.concept_id is not null) or (${kind}='person' and (a.person_id=${id} or exists(
        select 1 from public.encounter_object p join public.encounter_object x on x.encounter_id=p.encounter_id
        join public.object_ref er on er.id=p.encounter_id where p.object_id=${id} and x.object_id=a.id and er.archived_at is null
        and not exists(select 1 from public.object_alias former where former.former_object_id=er.id)))))
    ) select id,type,substring(body_text from 1 for 300) as text,char_length(body_text)>300 as clipped,
      to_char(captured_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "capturedAt",association
    from eligible where (${afterArtifact}::uuid is null or (captured_at,id)<(select captured_at,id from eligible where id=${afterArtifact}::uuid))
    order by captured_at desc,id desc limit 21`;
  const observationPage = kind === "concept" ? (await inspectPersonTransaction(tx,id,options.observations,"concept")).page : null;
  return {id,kind,label:root.label as string,conceptKind:root.conceptKind as string|null,archived:root.archived as boolean,
    encounters:selected.map(row=>({...row,links:links.filter(link=>link.encounterId===row.id)})),
    nextEncounter:encounters.length>20?selected.at(-1)!.id:null,artifacts:artifacts.slice(0,20),
    nextArtifact:artifacts.length>20?artifacts[19]!.id:null,observationPage};
}
export type TrailView = NonNullable<Awaited<ReturnType<typeof readTrailTransaction>>>;
export function trailReader(connection: ReturnType<typeof postgres>) {
  return async (kind: TrailKind,id: string,options?: TrailOptions): Promise<TrailView|null> => {
    const result=await connection.begin("isolation level repeatable read read only",async tx=>{
      await tx`set local statement_timeout = '20s'`;
      const [guard]=await tx`select current_setting('transaction_read_only') as mode`;
      if(guard?.mode!=="on")throw new Error("TRAIL_NOT_READ_ONLY");
      return {view:await readTrailTransaction(tx,kind,id,options)};
    });return result.view;
  };
}
