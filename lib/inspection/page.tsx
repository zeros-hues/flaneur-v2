import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { memoryInspection } from "./runtime";
import { MemoryDetail } from "@/components/inspection/MemoryDetail";
import { inspectionOffset } from "./source";
export type InspectionParams={params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>};
export async function memoryDetailPage(kind:"artifact"|"encounter",{params,searchParams}:InspectionParams){
 await requireSession();const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();
 const raw=await searchParams,query:Record<string,string>={};
 try{for(const key of ["offset","snapshots","encounters","observations"]){const value=raw[key];if(value===undefined)continue;if(typeof value!=="string")notFound();
   if(key==="offset")inspectionOffset(value);else z.uuid().parse(value);query[key]=value;}
 }catch{notFound();}
 let detail;try{detail=await memoryInspection.detail(kind,id,query);}catch{return <main className="sheet"><p role="alert">Memory inspection is unavailable. Please try again.</p></main>;}
 if(!detail)notFound();return <MemoryDetail detail={detail} query={query}/>;
}
