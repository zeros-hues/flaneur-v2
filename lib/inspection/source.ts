import { gunzipSync } from "node:zlib";
export const SOURCE_DOWNLOAD_MAX=4*1024*1024;
export const SOURCE_VIEW_MAX=2*1024*1024;
export const TEXT_CHUNK=10000;
export function safeSourceUrl(value:string|null){try{const url=new URL(value??"");return ["https:","http:"].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}}
export function inspectionOffset(value:unknown){
 if(value===undefined)return 0;
 if(typeof value!=="string"||!/^\d{1,8}$/.test(value)||Number(value)>20000000)throw new Error("INSPECTION_OFFSET_INVALID");
 return Number(value);
}
export function capturedMarkup(bytes:Uint8Array,offset:number){
 try{const decoded=gunzipSync(bytes,{maxOutputLength:SOURCE_VIEW_MAX});
  const text=new TextDecoder("utf-8",{fatal:true}).decode(decoded),points=Array.from(text);
  if(offset>points.length)throw new Error("INSPECTION_OFFSET_INVALID");
  return {state:"text" as const,text:points.slice(offset,offset+TEXT_CHUNK).join(""),nextOffset:offset+TEXT_CHUNK<points.length?offset+TEXT_CHUNK:null};
 }catch(error){if(error instanceof Error&&error.message==="INSPECTION_OFFSET_INVALID")throw error;
  return {state:"unavailable" as const,text:null,nextOffset:null};}
}
