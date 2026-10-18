import { z } from "zod";
export function snapshotDownload(deps:{authorize(request:Request):Promise<Response|null>;read(id:string):Promise<Uint8Array|null>}){
 return async(request:Request,rawId:string)=>{
  const headers={"cache-control":"no-store",vary:"Cookie, Authorization","x-content-type-options":"nosniff"};
  const fail=(error:string,status:number)=>Response.json({error},{status,headers});
  try{const denied=await deps.authorize(request);if(denied)return denied;}catch{return fail("source_unavailable",503);}
  const parsed=z.uuid().safeParse(rawId);if(!parsed.success)return fail("invalid_source",400);
  try{const bytes=await deps.read(parsed.data.toLowerCase());if(!bytes)return fail("source_not_found",404);
   return new Response(new Uint8Array(bytes),{headers:{...headers,"content-type":"application/gzip",
    "content-disposition":`attachment; filename="flaneur-snapshot-${parsed.data.toLowerCase()}.gz"`,"content-length":String(bytes.length)}});
  }catch(error){return fail(error instanceof Error&&error.message==="SOURCE_DOWNLOAD_LIMIT"?"source_too_large":"source_unavailable",
    error instanceof Error&&error.message==="SOURCE_DOWNLOAD_LIMIT"?413:503);}
 };
}
