import type postgres from 'postgres';
import {z} from 'zod';
import {migrationId} from '../migration/identity';
import {authorshipAssertions,authorshipOrigin} from './authorship';

export const authorshipPanelTarget=z.object({kind:z.enum(['person','artifact']),id:z.uuid().transform(value=>value.toLowerCase())}).strict();
export const authorshipPanelQuery=z.object({cursor:z.uuid().transform(value=>value.toLowerCase()).optional()}).strict();
/** The same current-support check as source review, with bounded, explicitly paged edge history. */
export async function authorshipPanelTransaction(sql:postgres.TransactionSql,rawKind:'person'|'artifact',rawId:string,rawQuery:unknown={}){
 const {kind,id}=authorshipPanelTarget.parse({kind:rawKind,id:rawId}),{cursor}=authorshipPanelQuery.parse(rawQuery);
 const [object]=await sql`select id from public.object_ref where id=${id} and kind=${kind}`;
 if(!object)return {page:null};
 const edges=await sql<{id:string;artifactId:string;personId:string;state:string;personName:string;sourceLabel:string|null}[]>`
  select r.id,r.from_object_id as "artifactId",r.to_object_id as "personId",r.state,
   substring(p.name from 1 for 180) as "personName",substring(a.source_url from 1 for 180) as "sourceLabel"
  from public.relationship r join public.artifact a on a.id=r.from_object_id join public.person p on p.id=r.to_object_id
  where r.predicate='authored_by' and r.origin_key='reviewed-authorship-v1:'||r.from_object_id::text||':'||r.to_object_id::text
   and (case when ${kind}='artifact' then r.from_object_id else r.to_object_id end)=${id}
   and (${cursor??null}::uuid is null or r.id>${cursor??null}::uuid) order by r.id limit 21`;
 const cache=new Map<string,Awaited<ReturnType<typeof authorshipAssertions>>>(),items=[];
 for(const edge of edges.slice(0,20)){
  if(edge.id!==migrationId(authorshipOrigin(edge.artifactId,edge.personId)))throw new Error('AUTHORSHIP_PANEL_CONFLICT');
  if(!cache.has(edge.artifactId))cache.set(edge.artifactId,await authorshipAssertions(sql,edge.artifactId));
  const history=cache.get(edge.artifactId)!.filter(row=>row.relationshipId===edge.id);
  const support=edge.state==='rejected'?[]:history.filter(row=>row.current);
  const status=edge.state==='rejected'?'rejected':!support.length?'historical':edge.state==='active'?'owner-confirmed':'candidate';
  items.push({...edge,status,supportCount:support.length,historyCount:history.length,
   history:history.slice(0,20).map(row=>({...row,current:edge.state!=='rejected'&&row.current}))});
 }
 return {page:{kind,id,items,nextCursor:edges.length>20?edges[19]!.id:null}};
}
export type AuthorshipPanelPage=NonNullable<Awaited<ReturnType<typeof authorshipPanelTransaction>>['page']>;
export function authorshipPanelReader(connection:ReturnType<typeof postgres>){
 return async(kind:'person'|'artifact',id:string,query:unknown={})=>{
  const result=await connection.begin('isolation level repeatable read read only',async sql=>{
   await sql`set local statement_timeout='15s'`;
   const [guard]=await sql`select current_setting('transaction_read_only') as mode`;
   if(guard?.mode!=='on')throw new Error('AUTHORSHIP_PANEL_NOT_READ_ONLY');
   return authorshipPanelTransaction(sql,kind,id,query);
  });return result.page;
 };
}
