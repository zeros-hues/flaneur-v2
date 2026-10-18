import { z } from "zod";
import { openWalk,recordWalkEvent,WALK_EVENT_KINDS,type WalkSessionStore } from "./sessions";
import type { WalkRead } from "./view";
const input=z.discriminatedUnion("action",[
 z.object({action:z.literal("start"),timezone:z.string().min(1).max(100),context:z.string().max(2000).optional()}).strict(),
 z.object({action:z.literal("event"),sessionId:z.uuid(),stopId:z.uuid(),eventId:z.uuid(),kind:z.enum(WALK_EVENT_KINDS)}).strict(),
]);
const headers={"cache-control":"no-store",vary:"Cookie, Authorization","x-content-type-options":"nosniff"};
export function walkHandler(deps:{ownerId:string;store:WalkSessionStore;authorize(request:Request):Promise<Response|null>;read(ownerId:string):Promise<WalkRead>}){
 const ownerId=z.uuid().parse(deps.ownerId).toLowerCase();
 return async(request:Request)=>{
  const fail=(error:string,status:number)=>Response.json({error},{status,headers});
  if(!["GET","POST"].includes(request.method))return fail("method_not_allowed",405);
  try{const denied=await deps.authorize(request);if(denied)return denied;}catch{return fail("walk_unavailable",503);}
  if(request.method==="GET")try{return Response.json(await deps.read(ownerId),{headers});}catch{return fail("walk_unavailable",503);}
  if(request.headers.get("content-type")?.split(";",1)[0]?.trim().toLowerCase()!=="application/json")return fail("json_required",415);
  const reader=request.body?.getReader();if(!reader)return fail("invalid_walk",400);
  let value:z.infer<typeof input>;
  try{const chunks:Uint8Array[]=[];let size=0;
   while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel().catch(()=>{});return fail("walk_too_large",413);}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   value=input.parse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)));
  }catch{return fail("invalid_walk",400);}finally{reader.releaseLock();}
  try{
   if(value.action==="start")await openWalk({ownerId,timezone:value.timezone,...(value.context!==undefined?{context:value.context}:{})},deps.store);
   else{const {action,...event}=value;await recordWalkEvent({...event,ownerId},deps.store);}
   return Response.json(await deps.read(ownerId),{headers});
  }catch(error){
   if(error instanceof z.ZodError)return fail("invalid_walk",400);
   const code=error&&typeof error==="object"&&"code"in error?error.code:null;
   const message=error instanceof Error?error.message:"";
   return fail(message==="WALK_TIMEZONE_LOCKED"?"timezone_locked":message==="WALK_SESSION_EXPIRED"?"walk_expired":
     code==="23514"||code==="23505"||["WALK_EVENT_CONFLICT","WALK_STOP_UNAVAILABLE"].includes(message)?"walk_changed":"walk_unavailable",
     code==="23514"||code==="23505"||["WALK_EVENT_CONFLICT","WALK_STOP_UNAVAILABLE","WALK_TIMEZONE_LOCKED","WALK_SESSION_EXPIRED"].includes(message)?409:503);
  }
 };
}
