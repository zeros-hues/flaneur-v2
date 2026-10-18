import type postgres from "postgres";
import type { MemoryItem } from "./memory";
export async function memoryLabelsInTransaction(tx:postgres.TransactionSql,ids:string[]){
  if(!ids.length)return [];
  const rows=await tx<{id:string;kind:MemoryItem["kind"];label:string}[]>`select r.id,r.kind,
    case when r.kind='person' then p.name when r.kind='artifact' then coalesce(a.body_text,a.source_url)
      else 'Recorded encounter' end as label from public.object_ref r
    left join public.person p on p.id=r.id left join public.artifact a on a.id=r.id
    where r.id=any(${ids}::uuid[]) and r.archived_at is null
      and not exists(select 1 from public.object_alias former where former.former_object_id=r.id)`;
  return rows.map(row=>({...row,label:Array.from(row.label??row.kind).slice(0,180).join("")}));
}
