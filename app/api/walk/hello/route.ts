import { unauthorisedResponse } from "@/lib/auth";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 const denied=await unauthorisedResponse(request);if(denied)return denied;
 return Response.json({error:"legacy_walk_draft_retired"},{status:410,headers:{"cache-control":"no-store"}});
}
