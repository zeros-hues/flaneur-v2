import {z} from 'zod';
import type postgres from 'postgres';
import {trajectoryClaims} from './trajectory-store';
export const trajectoryPanelQuery=z.object({q:z.string().trim().min(2).max(100).optional(),cursor:z.uuid().optional(),searchCursor:z.uuid().optional()}).strict().refine(v=>!v.searchCursor||!!v.q);
export async function trajectoryPanelTransaction(sql:postgres.TransactionSql,rawId:string,rawQuery:unknown={}){
 const id=z.uuid().parse(rawId).toLowerCase(),query=trajectoryPanelQuery.parse(rawQuery);
 const [person]=await sql`select id,(archived_at is null and not exists(select 1 from public.object_alias a where a.former_object_id=r.id)) as available
  from public.object_ref r where r.id=${id} and r.kind='person'`;
 if(!person)return null;
 const claims=(await trajectoryClaims(sql,id)).filter(v=>!query.cursor||v.id>query.cursor);
 const concepts=person.available&&query.q?await sql<{id:string;label:string;kind:'concept'|'topic'}[]>`select c.id,c.label,c.kind from public.concept c
  join public.object_ref r on r.id=c.id and r.archived_at is null
  where char_length(c.label) between 1 and 300 and position(lower(${query.q}) in lower(c.label))>0
   and not exists(select 1 from public.object_alias a where a.former_object_id=c.id)
   and (${query.searchCursor??null}::uuid is null or c.id>${query.searchCursor??null}::uuid) order by c.id limit 21`:[];
 return {id,available:!!person.available,items:claims.slice(0,20),nextCursor:claims.length>20?claims[19]!.id:null,
  concepts:concepts.slice(0,20),nextSearchCursor:concepts.length>20?concepts[19]!.id:null};
}
export type TrajectoryPage=NonNullable<Awaited<ReturnType<typeof trajectoryPanelTransaction>>>;
export function trajectoryPanelReader(connection:ReturnType<typeof postgres>){return(id:string,query:unknown={})=>connection.begin('isolation level repeatable read read only',async sql=>{
 await sql`set local statement_timeout='15s'`;const [guard]=await sql`select current_setting('transaction_read_only') as mode`;
 if(guard?.mode!=='on')throw new Error('TRAJECTORY_NOT_READ_ONLY');return trajectoryPanelTransaction(sql,id,query);
});}
