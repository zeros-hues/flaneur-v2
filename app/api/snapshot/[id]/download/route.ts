import { unauthorisedResponse } from "@/lib/auth";
import { memoryInspection } from "@/lib/inspection/runtime";
import { snapshotDownload } from "@/lib/inspection/download";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const download=snapshotDownload({authorize:unauthorisedResponse,read:memoryInspection.bytes});
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return download(request,(await params).id);}
