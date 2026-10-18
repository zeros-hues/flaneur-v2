import type postgres from 'postgres';
import {z} from 'zod';
import {migrationId} from '../migration/identity';
import {conceptAssociationOrigin,conceptAssociationProofs} from './concept-association';
export const conceptPanelTarget=z.object({kind:z.enum(['person','artifact','concept']),id:z.uuid().transform(value=>value.toLowerCase())}).strict();
export const conceptPanelQuery=z.object({q:z.string().trim().min(2).max(100).optional(),cursor:z.uuid().optional(),searchCursor:z.uuid().optional(),historyEdge:z.uuid().optional(),historyCursor:z.uuid().optional()}).strict()
 .refine(value=>(!value.searchCursor||!!value.q)&&(!value.historyCursor||!!value.historyEdge)&&
  (!value.historyEdge||(!value.q&&!value.searchCursor&&!value.cursor)));
export async function conceptPanelTransaction(sql:postgres.TransactionSql,rawKind:'person'|'artifact'|'concept',rawId:string,rawQuery:unknown={}){
 const {kind,id}=conceptPanelTarget.parse({kind:rawKind,id:rawId}),query=conceptPanelQuery.parse(rawQuery);
 if(kind==='concept'&&(query.q||query.searchCursor))throw new Error('INVALID_CONCEPT_QUERY');
 const [object]=await sql`select id,(archived_at is null and not exists(select 1 from public.object_alias alias where alias.former_object_id=r.id)) as available
  from public.object_ref r where id=${id} and kind=${kind}`;
 if(!object)return {page:null};
 const edges=await sql<{id:string;subjectId:string;subjectKind:'person'|'artifact';subjectLabel:string;conceptId:string;conceptLabel:string;conceptKind:'concept'|'topic';state:string}[]>`
  select r.id,r.from_object_id as "subjectId",sr.kind as "subjectKind",substring(coalesce(p.name,a.source_url,'Saved Artifact') from 1 for 180) as "subjectLabel",
   c.id as "conceptId",substring(c.label from 1 for 300) as "conceptLabel",c.kind as "conceptKind",r.state
  from public.relationship r join public.object_ref sr on sr.id=r.from_object_id and sr.kind in('person','artifact')
  left join public.person p on p.id=sr.id left join public.artifact a on a.id=sr.id join public.concept c on c.id=r.to_object_id
  where r.predicate='associated_with_concept' and r.origin_key='reviewed-concept-v1:'||r.from_object_id::text||':'||r.to_object_id::text
   and (case when ${kind}='concept' then r.to_object_id else r.from_object_id end)=${id}
   and (${query.historyEdge??null}::uuid is null or r.id=${query.historyEdge??null}::uuid)
   and (${query.cursor??null}::uuid is null or r.id>${query.cursor??null}::uuid) order by r.id limit 21`;
 const items=[];
 for(const edge of edges.slice(0,20)){
  if(edge.id!==migrationId(conceptAssociationOrigin(edge.subjectId,edge.conceptId)))throw new Error('CONCEPT_ASSOCIATION_CONFLICT');
  const proofs=await conceptAssociationProofs(sql,edge.id),support=proofs.filter(proof=>proof.current);
  const history=proofs.filter(proof=>!query.historyCursor||proof.id>query.historyCursor.toLowerCase());
  items.push({...edge,status:edge.state==='rejected'?'rejected':!support.length?'historical':edge.state==='active'?'owner-reviewed':'candidate',
   supportCount:support.length,historyCount:proofs.length,history:history.slice(0,20),nextHistoryCursor:history.length>20?history[19]!.id:null});
 }
 const matches=object.available&&kind!=='concept'&&query.q?await sql<{id:string;label:string;kind:'concept'|'topic'}[]>`
  select c.id,c.label,c.kind from public.concept c join public.object_ref r on r.id=c.id and r.archived_at is null
  where char_length(c.label) between 1 and 300 and position(lower(${query.q}) in lower(c.label))>0
   and not exists(select 1 from public.object_alias alias where alias.former_object_id=c.id)
   and (${query.searchCursor??null}::uuid is null or c.id>${query.searchCursor??null}::uuid) order by c.id limit 21`:[];
 return {page:{kind,id,available:!!object.available,items,nextCursor:edges.length>20?edges[19]!.id:null,
  concepts:matches.slice(0,20),nextSearchCursor:matches.length>20?matches[19]!.id:null}};
}
export type ConceptPanelPage=NonNullable<Awaited<ReturnType<typeof conceptPanelTransaction>>['page']>;
export function conceptPanelReader(connection:ReturnType<typeof postgres>){
 return async(kind:'person'|'artifact'|'concept',id:string,query:unknown={})=>{
  const result=await connection.begin('isolation level repeatable read read only',async sql=>{
   await sql`set local statement_timeout='15s'`;
   const [guard]=await sql`select current_setting('transaction_read_only') as mode`;
   if(guard?.mode!=='on')throw new Error('CONCEPT_ASSOCIATION_NOT_READ_ONLY');
   return conceptPanelTransaction(sql,kind,id,query);
  });return result.page;
 };
}
