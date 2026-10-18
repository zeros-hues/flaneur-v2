import { z } from "zod";
import { createUserNote,type UserNoteStore } from "./authoring";
import { authoredNoteText } from "./authoring";
const input=z.object({requestId:z.uuid(),personId:z.uuid(),body:authoredNoteText}).strict();
const headers={"cache-control":"no-store",vary:"Cookie, Authorization","x-content-type-options":"nosniff"};
export function userNoteHandler(store:UserNoteStore,policy:{origin:string;authorize(request:Request):Promise<boolean>}){
  const origin=new URL(policy.origin);
  if(origin.protocol!=="https:"||origin.username||origin.password||origin.pathname!=="/"||origin.search||origin.hash)throw new Error("INVALID_NOTE_ORIGIN");
  return async(request:Request)=>{
    const reply=(error:string,status:number)=>Response.json({error},{status,headers});
    if(request.method!=="POST")return reply("method_not_allowed",405);
    try{if(!await policy.authorize(request))return reply("unauthorised",401);}catch{return reply("note_unavailable",503);}
    if(request.headers.get("origin")!==origin.origin)return reply("origin_not_allowed",403);
    if(request.headers.get("content-type")?.split(";",1)[0]?.trim().toLowerCase()!=="application/json")return reply("json_required",415);
    let value:unknown;const reader=request.body?.getReader();if(!reader)return reply("invalid_note",400);
    try{
      const chunks:Uint8Array[]=[];let size=0;
      while(true){const{done,value:bytes}=await reader.read();if(done)break;size+=bytes.length;
        if(size>124000){await reader.cancel().catch(()=>{});return reply("note_too_large",413);}chunks.push(bytes);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      value=input.parse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)));
    }catch{return reply("invalid_note",400);}finally{reader.releaseLock();}
    try{const result=await createUserNote(value,store);return Response.json({id:result.note.id,body:result.note.body,replayed:result.replayed},{status:result.replayed?200:201,headers});}
    catch(error){return reply(error instanceof Error&&error.message==="NOTE_REQUEST_CONFLICT"?"request_conflict":
      error instanceof Error&&error.message==="NOTE_PERSON_UNAVAILABLE"?"person_unavailable":"note_unavailable",
      error instanceof Error&&["NOTE_REQUEST_CONFLICT","NOTE_PERSON_UNAVAILABLE"].includes(error.message)?409:503);}
  };
}
