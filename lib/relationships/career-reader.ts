import type postgres from 'postgres';
import {z} from 'zod';
import {careerProofs,careerOrigin} from './career';
import {migrationId} from '../migration/identity';
export const careerQuery=z.object({q:z.string().trim().min(2).max(100).optional(),cursor:z.uuid().optional(),searchCursor:z.uuid().optional(),historyEdge:z.uuid().optional(),historyCursor:z.uuid().optional()}).strict()
 .refine(v=>(!v.searchCursor||!!v.q)&&(!v.historyCursor||!!v.historyEdge)&&(!v.historyEdge||(!v.q&&!v.cursor&&!v.searchCursor)));
export async function careerPanelTransaction(sql:postgres.TransactionSql,rawId:string,rawQuery:unknown={}){
 const id=z.uuid().parse(rawId).toLowerCase(),query=careerQuery.parse(rawQuery);
 const [person]=await sql`select r.id,(r.archived_at is null and not exists(select 1 from public.object_alias a where a.former_object_id=r.id)) as available
  from public.object_ref r where r.id=${id} and r.kind='person'`;
 if(!person)return null;
 const edges=await sql<{id:string;organisationId:string;label:string;predicate:'educated_at'|'employed_by';state:string}[]>`
  select r.id,r.to_object_id as "organisationId",o.display_name as label,r.predicate,r.state from public.relationship r
  join public.organisation o on o.id=r.to_object_id where r.from_object_id=${id} and r.predicate in('educated_at','employed_by')
   and r.origin_key='reviewed-career-v1:'||r.predicate||':'||r.from_object_id::text||':'||r.to_object_id::text
   and (${query.cursor??null}::uuid is null or r.id>${query.cursor??null}::uuid)
   and (${query.historyEdge??null}::uuid is null or r.id=${query.historyEdge??null}::uuid) order by r.id limit 21`;
 const items=[];
 for(const edge of edges.slice(0,20)){
  if(edge.id!==migrationId(careerOrigin(id,edge.organisationId,edge.predicate)))throw new Error('CAREER_EDGE_CONFLICT');
  const proofs=await careerProofs(sql,edge.id),history=proofs.filter(v=>!query.historyCursor||v.id>query.historyCursor);
  items.push({...edge,status:edge.state==='rejected'?'rejected':edge.state==='active'&&proofs.some(v=>v.current)?'owner-reviewed':'historical / unsupported',
   historyCount:proofs.length,history:history.slice(0,20),nextHistoryCursor:history.length>20?history[19]!.id:null});
 }
 const organisations=person.available&&query.q?await sql<{id:string;label:string}[]>`select o.id,o.display_name as label from public.organisation o
  join public.object_ref r on r.id=o.id and r.kind='organisation' and r.archived_at is null
  where char_length(o.display_name) between 1 and 300 and position(lower(${query.q}) in lower(o.display_name))>0
   and not exists(select 1 from public.object_alias a where a.former_object_id=o.id)
   and (${query.searchCursor??null}::uuid is null or o.id>${query.searchCursor??null}::uuid) order by o.id limit 21`:[];
 return {id,available:!!person.available,items,nextCursor:edges.length>20?edges[19]!.id:null,organisations:organisations.slice(0,20),nextSearchCursor:organisations.length>20?organisations[19]!.id:null};
}
export type CareerPage=NonNullable<Awaited<ReturnType<typeof careerPanelTransaction>>>;
export function careerPanelReader(connection:ReturnType<typeof postgres>){return (id:string,query:unknown={})=>connection.begin('isolation level repeatable read read only',async sql=>{
 await sql`set local statement_timeout='15s'`;const [guard]=await sql`select current_setting('transaction_read_only') as mode`;
 if(guard?.mode!=='on')throw new Error('CAREER_NOT_READ_ONLY');return careerPanelTransaction(sql,id,query);
});}
