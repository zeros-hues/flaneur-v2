import "server-only";
import { sql } from "@/lib/db";
import { unauthorisedResponse } from "@/lib/auth";
import { postgresWalkSessionStore } from "./postgres-sessions";
import { postgresWalkView } from "./postgres-view";
import { walkHandler } from "./handler";
let handler:ReturnType<typeof walkHandler>|undefined;
export async function handleWalk(request:Request){
 try{
  handler??=walkHandler({ownerId:process.env.OWNER_PRINCIPAL_ID??"",store:postgresWalkSessionStore(sql),read:postgresWalkView(sql),authorize:unauthorisedResponse});
  return await handler(request);
 }catch{return Response.json({error:"walk_unavailable"},{status:503,headers:{"cache-control":"no-store"}});}
}
