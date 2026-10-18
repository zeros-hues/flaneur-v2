import type postgres from "postgres";
import { z } from "zod";
import { inspectPersonTransaction } from "../review/postgres-inspection";
import { capturedMarkup,inspectionOffset,safeSourceUrl,SOURCE_DOWNLOAD_MAX,TEXT_CHUNK } from "./source";
type Tx=postgres.TransactionSql;
export interface DetailOptions {offset?:string;observations?:string;snapshots?:string;encounters?:string}
const cursor=(value:string|undefined)=>value?z.uuid().parse(value).toLowerCase():null;
export async function inspectMemoryTransaction(tx:Tx,kind:"artifact"|"encounter",rawId:string,options:DetailOptions={}){
 const id=z.uuid().parse(rawId).toLowerCase(),offset=inspectionOffset(options.offset),afterSnapshot=cursor(options.snapshots),afterEncounter=cursor(options.encounters);
 const [registry]=await tx`select archived_at is not null as archived from public.object_ref r where id=${id} and kind=${kind}
   and not exists(select 1 from public.object_alias a where a.former_object_id=r.id)`;
 if(!registry)return {detail:null};
 const [object]=kind==="artifact"?await tx`select id,type,substring(body_text from ${offset+1}::integer for ${TEXT_CHUNK}::integer) as text,
   char_length(body_text) as length,source_url,person_id,to_char(captured_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as captured_at
   from public.artifact where id=${id}`:await tx`select id,kind,explicit_context_text,source_context::text,
   snapshot_id,to_char(occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as occurred_at,
   to_char(recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as recorded_at from public.encounter where id=${id}`;
 if(!object)return {detail:null};
 if(kind==="artifact"&&offset>(object.length??0))throw new Error("INSPECTION_OFFSET_INVALID");
 if(kind==="encounter"&&Buffer.byteLength((object.source_context??"")+(object.explicit_context_text??""))>128000)throw new Error("INSPECTION_CONTEXT_LIMIT");
 const sources=kind==="artifact"?await tx`select id,source_url,to_char(captured_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as captured_at
   from public.snapshot where artifact_id=${id} and (${afterSnapshot}::uuid is null or id>${afterSnapshot}::uuid) order by id limit 21`:
   await tx`select id,source_url,to_char(captured_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as captured_at from public.snapshot where id=${object.snapshot_id??null}::uuid`;
 const encounters=kind==="artifact"?await tx`select distinct e.id,e.kind,r.archived_at is not null as archived,
   to_char(e.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as occurred_at
   from public.encounter e join public.encounter_object x on x.encounter_id=e.id join public.object_ref r on r.id=e.id
   where x.object_id=${id} and (${afterEncounter}::uuid is null or e.id>${afterEncounter}::uuid)
     and not exists(select 1 from public.object_alias a where a.former_object_id=e.id) order by e.id limit 21`:[];
 const links=kind==="encounter"?await tx`select x.object_id as id,x.relation,r.kind,r.archived_at is not null as archived,
   case when r.kind='person' then p.name when r.kind='artifact' then coalesce(substring(a.body_text from 1 for 180),a.type::text) else r.kind end as label
   from public.encounter_object x join public.object_ref r on r.id=x.object_id left join public.person p on p.id=r.id left join public.artifact a on a.id=r.id
   where x.encounter_id=${id} and not exists(select 1 from public.object_alias former where former.former_object_id=r.id)
   order by x.object_id,x.relation limit 201`:[];
 if(links.length>200)throw new Error("INSPECTION_LINK_LIMIT");
 const observations=(await inspectPersonTransaction(tx,id,options.observations,kind)).page!;
 return {detail:{id,kind,archived:registry.archived,
  artifact:kind==="artifact"?{type:object.type,text:object.text??null,sourceUrl:safeSourceUrl(object.source_url),capturedAt:object.captured_at,
    nextOffset:offset+TEXT_CHUNK<(object.length??0)?offset+TEXT_CHUNK:null,legacyPersonId:object.person_id??null}:null,
  encounter:kind==="encounter"?{type:object.kind,contextText:object.explicit_context_text??null,sourceContext:object.source_context??null,
    occurredAt:object.occurred_at,recordedAt:object.recorded_at}:null,
  sources:sources.slice(0,20).map(row=>({id:row.id,sourceUrl:safeSourceUrl(row.source_url),capturedAt:row.captured_at})),
  nextSnapshot:sources.length>20?sources[19]!.id:null,
  encounters:encounters.slice(0,20).map(row=>({id:row.id,kind:row.kind,archived:row.archived,occurredAt:row.occurred_at})),
  nextEncounter:encounters.length>20?encounters[19]!.id:null,
  links:links.map(row=>({id:row.id,kind:row.kind,relation:row.relation,archived:row.archived,label:row.label})),
  observations:observations.observations,nextObservation:observations.nextCursor}};
}
export async function inspectSnapshotTransaction(tx:Tx,rawId:string,rawOffset?:string,rawRepresentation?:string){
 const id=z.uuid().parse(rawId).toLowerCase(),offset=inspectionOffset(rawOffset),representation=cursor(rawRepresentation);
 const [row]=await tx`select id,artifact_id,capture_type,sections_covered,source_url,parser_version,adapter_id,content_hash,octet_length(content_gzip) as bytes,
   to_char(captured_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as captured_at from public.snapshot where id=${id}`;
 if(!row)return {snapshot:null};
 const representations=await tx`select id,normalizer_version from public.snapshot_representation where snapshot_id=${id} order by id limit 21`;
 if(representations.length>20)throw new Error("INSPECTION_REPRESENTATION_LIMIT");
 let content:ReturnType<typeof capturedMarkup>;
 if(representation){
  const [normalized]=await tx`select substring(text from ${offset+1}::integer for ${TEXT_CHUNK}::integer) as text,char_length(text) as length
    from public.snapshot_representation where id=${representation} and snapshot_id=${id}`;
  if(!normalized)throw new Error("INSPECTION_REPRESENTATION_INVALID");
  if(offset>normalized.length)throw new Error("INSPECTION_OFFSET_INVALID");
  content={state:"text",text:normalized.text,nextOffset:offset+TEXT_CHUNK<normalized.length?offset+TEXT_CHUNK:null};
 }else if(row.bytes>SOURCE_DOWNLOAD_MAX)content={state:"unavailable",text:null,nextOffset:null};
 else{const [bytes]=await tx`select content_gzip from public.snapshot where id=${id}`;content=capturedMarkup(bytes!.content_gzip,offset);}
 const encounters=await tx`select e.id from public.encounter e join public.object_ref r on r.id=e.id where e.snapshot_id=${id}
   and not exists(select 1 from public.object_alias a where a.former_object_id=e.id)`;
 return {snapshot:{id,captureType:row.capture_type,sectionsCovered:row.sections_covered as string[],artifactId:row.artifact_id??null,encounterId:encounters[0]?.id??null,sourceUrl:safeSourceUrl(row.source_url),capturedAt:row.captured_at,parserVersion:row.parser_version,
  adapterId:row.adapter_id,contentHash:row.content_hash,downloadAvailable:row.bytes<=SOURCE_DOWNLOAD_MAX,
  representations:representations.map(item=>({id:item.id,version:item.normalizer_version})),representation,...content}};
}
export async function snapshotBytesTransaction(tx:Tx,rawId:string){
 const id=z.uuid().parse(rawId).toLowerCase();const [row]=await tx`select octet_length(content_gzip) as bytes from public.snapshot where id=${id}`;
 if(!row)return null;if(row.bytes>SOURCE_DOWNLOAD_MAX)throw new Error("SOURCE_DOWNLOAD_LIMIT");
 const [content]=await tx`select content_gzip from public.snapshot where id=${id}`;return content!.content_gzip as Uint8Array;
}
export function memoryInspectionReader(connection:ReturnType<typeof postgres>){
 async function read<T>(work:(tx:Tx)=>Promise<T>):Promise<T>{const result=await connection.begin("isolation level repeatable read read only",async tx=>{
   await tx`set local statement_timeout = '20s'`;const [guard]=await tx`select current_setting('transaction_read_only') as mode`;
   if(guard?.mode!=="on")throw new Error("INSPECTION_NOT_READ_ONLY");return {value:await work(tx)};
  });return result.value;}
 return {detail:(kind:"artifact"|"encounter",id:string,options?:DetailOptions)=>read(async tx=>(await inspectMemoryTransaction(tx,kind,id,options)).detail),
  snapshot:(id:string,offset?:string,representation?:string)=>read(async tx=>(await inspectSnapshotTransaction(tx,id,offset,representation)).snapshot),
  bytes:(id:string)=>read(tx=>snapshotBytesTransaction(tx,id))};
}
