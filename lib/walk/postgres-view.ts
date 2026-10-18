import type postgres from "postgres";
import { contextualCandidatesTransaction } from "./postgres-contextual";
import { loadWalkSessionTransaction } from "./postgres-sessions";
import { presentWalk,type WalkRead } from "./view";
export async function readWalkViewTransaction(tx:postgres.TransactionSql,ownerId:string):Promise<WalkRead>{
 const [anchor]=await tx`select timezone from public.walk_session where owner_id=${ownerId} order by created_at,id limit 1`;
 if(!anchor)return {timezone:null,session:null};
 const [current]=await tx`select id from public.walk_session where owner_id=${ownerId}
   and local_day=(clock_timestamp() at time zone ${anchor.timezone})::date`;
 if(!current)return {timezone:anchor.timezone,session:null};
 const session=await loadWalkSessionTransaction(tx,current.id,ownerId);
 const shown=await tx`select e.stop_id from public.attention_event e join public.walk_stop t on t.id=e.stop_id
   where t.session_id=${session.id} and e.kind='shown'`;
 return presentWalk(session,await contextualCandidatesTransaction(tx),new Set(shown.map(row=>row.stop_id)));
}
export function postgresWalkView(connection:ReturnType<typeof postgres>){
 return async(ownerId:string)=>{
  const result=await connection.begin('isolation level repeatable read read only',async tx=>{
   await tx`set local statement_timeout = '20s'`;
   const [guard]=await tx`select current_setting('transaction_read_only') as mode`;
   if(guard?.mode!=='on')throw new Error('WALK_VIEW_NOT_READ_ONLY');
   return {view:await readWalkViewTransaction(tx,ownerId)};
  });return result.view;
 };
}
