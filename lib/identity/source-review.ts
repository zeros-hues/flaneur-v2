import type postgres from "postgres";
import { z } from "zod";
import { capturedProfileTransaction } from "./captured-profile";
import { identityInspection } from "./inspection";
import { sourceNeutralPeople } from "./creation-readiness";
import {reassignmentContext} from './reassignment-context';

export const sourceReviewQuery=z.object({q:z.string().trim().min(2).max(100).optional(),cursor:z.uuid().optional()}).strict()
 .refine(input=>!input.cursor||!!input.q);
export async function sourceReviewTransaction(sql:postgres.TransactionSql,rawId:string,rawQuery:unknown={}){
 const id=z.uuid().parse(rawId).toLowerCase(),query=sourceReviewQuery.parse(rawQuery);
 const capture=await capturedProfileTransaction(sql,id);if(!capture)return {page:null};
 const associationIds=[...new Set([...capture.noticedPeople,...capture.activeProofs.map(proof=>proof.personId)])];
 const associated=associationIds.length?await sql`select p.id,p.name,r.archived_at is not null or exists(
   select 1 from public.object_alias a where a.former_object_id=p.id) as inactive
   from public.person p join public.object_ref r on r.id=p.id where p.id=any(${associationIds}) order by p.id`:[];
 const rows=query.q?await sql`select p.id,p.name from public.person p join public.object_ref r on r.id=p.id
   where r.archived_at is null and not exists(select 1 from public.object_alias a where a.former_object_id=p.id)
     and position(lower(${query.q}) in lower(p.name))>0
     and (${query.cursor??null}::uuid is null or p.id>${query.cursor??null}::uuid) order by p.id limit 21`:[];
 return {page:{snapshotId:id,supported:capture.captureType==='profile'&&capture.adapterId==='linkedin'&&capture.hasContentHash,
   available:capture.available===true,
   reassignment:reassignmentContext(capture,associated.map(person=>({id:person.id,name:person.name,inactive:!!person.inactive}))),
   canCreatePerson:await sourceNeutralPeople(sql)&&capture.available===true&&capture.captureType==='profile'&&capture.adapterId==='linkedin'&&
     capture.hasContentHash&&capture.noticedPeople.length===0&&capture.activeProofs.length===0,
   associations:associated.map(person=>({id:person.id as string,name:person.name as string,inactive:!!person.inactive,
     capture:identityInspection(capture,person.id,!!person.inactive)})),
   people:rows.slice(0,20).map(person=>({id:person.id as string,name:person.name as string,
     capture:identityInspection(capture,person.id,false)})),
   nextCursor:rows.length>20?rows[19]!.id as string:null}};
}
export type SourceReviewPage=NonNullable<Awaited<ReturnType<typeof sourceReviewTransaction>>['page']>;
export function sourceReviewReader(connection:ReturnType<typeof postgres>){
 return async(id:string,query:unknown)=>{
  const result=await connection.begin('isolation level repeatable read read only',async sql=>{
   await sql`set local statement_timeout='15s'`;
   const [guard]=await sql`select current_setting('transaction_read_only') as mode`;
   if(guard?.mode!=='on')throw new Error('IDENTITY_INSPECTION_NOT_READ_ONLY');
   return sourceReviewTransaction(sql,id,query);
  });return result.page;
 };
}
