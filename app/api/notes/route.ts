import { sql } from "@/lib/db";
import { getOwnerSessionRuntime } from "@/lib/session/runtime";
import { postgresUserNoteStore } from "@/lib/notes/postgres-authoring";
import { userNoteHandler } from "@/lib/notes/handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const owner=getOwnerSessionRuntime();
    return await userNoteHandler(postgresUserNoteStore(sql),{origin:process.env.OWNER_SESSION_ORIGIN??"",
      authorize:request=>owner.authorize(request,"write")})(request);
  }catch{return Response.json({error:"note_unavailable"},{status:503,headers:{"cache-control":"no-store"}});}
}
