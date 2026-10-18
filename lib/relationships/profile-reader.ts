import type postgres from 'postgres';
import {z} from 'zod';
import {migrationId} from '../migration/identity';
import {profileEdgeView} from './profile-policy';
import {currentProfileProofs,currentProfileSupports,profileOrigin} from './profile-store';
export async function readProfileRelationshipsTransaction(sql:postgres.TransactionSql,rawKind:'person'|'artifact',rawId:string,rawCursor?:string){
 const kind=z.enum(['person','artifact']).parse(rawKind),id=z.uuid().parse(rawId).toLowerCase(),cursor=rawCursor?z.uuid().parse(rawCursor).toLowerCase():null;
 const [object]=await sql`select id from public.object_ref where id=${id} and kind=${kind}`;
 if(!object)return {page:null};
 const edges=await sql<{id:string;artifactId:string;personId:string;state:string;personName:string;sourceLabel:string}[]>`
  select r.id,r.from_object_id as "artifactId",r.to_object_id as "personId",r.state,
   substring(p.name from 1 for 180) as "personName",substring(a.source_url from 1 for 180) as "sourceLabel"
  from public.relationship r join public.artifact a on a.id=r.from_object_id join public.person p on p.id=r.to_object_id
  where r.predicate='profile_of' and r.origin_key='reviewed-profile-v1:'||r.from_object_id::text||':'||r.to_object_id::text
   and (case when ${kind}='artifact' then r.from_object_id else r.to_object_id end)=${id}
   and (${cursor}::uuid is null or r.id>${cursor}::uuid) order by r.id limit 21`;
 const items=[];
 for(const edge of edges.slice(0,20)){
  if(edge.id!==migrationId(profileOrigin(edge.artifactId,edge.personId)))throw new Error('PROFILE_RELATIONSHIP_CONFLICT');
  const proofs=await currentProfileProofs(sql,edge.artifactId),supports=await currentProfileSupports(sql,edge.artifactId);
  const view=profileEdgeView(edge,proofs,supports);
  items.push({...edge,status:view.state,support:view.support.slice(0,20),supportCount:view.support.length});
 }
 return {page:{kind,id,items,nextCursor:edges.length>20?edges[19]!.id:null}};
}
export type ProfileRelationshipsPage=NonNullable<Awaited<ReturnType<typeof readProfileRelationshipsTransaction>>['page']>;
export function profileRelationshipsReader(connection:ReturnType<typeof postgres>){
 return async(kind:'person'|'artifact',id:string,cursor?:string)=>{
  const result=await connection.begin('isolation level repeatable read read only',async sql=>{
   await sql`set local statement_timeout='15s'`;
   const [guard]=await sql`select current_setting('transaction_read_only') as mode`;
   if(guard?.mode!=='on')throw new Error('PROFILE_RELATIONSHIPS_NOT_READ_ONLY');
   return readProfileRelationshipsTransaction(sql,kind,id,cursor);
  });return result.page;
 };
}
