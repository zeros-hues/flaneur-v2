import {z} from 'zod';
import type postgres from 'postgres';
import {sourceReviewQuery} from '../identity/source-review';
import {authorshipCapture,authorshipAssertions} from './authorship';
export async function authorshipReviewTransaction(sql:postgres.TransactionSql,rawId:string,rawQuery:unknown={}){
 const id=z.uuid().parse(rawId).toLowerCase(),query=sourceReviewQuery.parse(rawQuery);
 const [snapshot]=await sql`select artifact_id,capture_type,adapter_id from public.snapshot where id=${id}`;
 if(!snapshot)return {page:null};
 const capture=await authorshipCapture(sql,id);
 const supported=snapshot.capture_type==='post'&&snapshot.adapter_id==='linkedin';
 const assertions=supported&&snapshot.artifact_id?await authorshipAssertions(sql,snapshot.artifact_id):[];
 const people=capture&&query.q?await sql`select p.id,p.name from public.person p join public.object_ref r on r.id=p.id
  where r.archived_at is null and not exists(select 1 from public.object_alias alias where alias.former_object_id=p.id)
   and position(lower(${query.q}) in lower(p.name))>0
   and (${query.cursor??null}::uuid is null or p.id>${query.cursor??null}::uuid) order by p.id limit 21`:[];
 return {page:{snapshotId:id,artifactId:snapshot.artifact_id as string|null,supported,available:!!capture,
  assertions:assertions.map(row=>({...row,status:row.state==='rejected'?'rejected':row.current?(row.state==='active'?'owner-confirmed':'candidate'):'historical',
   canReject:!!capture&&row.current&&row.state!=='rejected'&&row.snapshotId===id})),
  people:people.slice(0,20).map(row=>({id:row.id as string,name:(row.name as string).slice(0,180)})),
  nextCursor:people.length>20?people[19]!.id as string:null}};
}
export type AuthorshipReviewPage=NonNullable<Awaited<ReturnType<typeof authorshipReviewTransaction>>['page']>;
export function authorshipReviewReader(connection:ReturnType<typeof postgres>){
 return async(id:string,query:unknown)=>{
  const result=await connection.begin('isolation level repeatable read read only',async sql=>{
   await sql`set local statement_timeout='15s'`;
   const [guard]=await sql`select current_setting('transaction_read_only') as mode`;
   if(guard?.mode!=='on')throw new Error('AUTHORSHIP_INSPECTION_NOT_READ_ONLY');
   return authorshipReviewTransaction(sql,id,query);
  });return result.page;
 };
}
