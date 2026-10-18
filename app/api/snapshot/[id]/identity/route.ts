import { z } from "zod";
import { unauthorisedResponse } from "@/lib/auth";
import { sql } from "@/lib/db";
import { sourceReviewQuery,sourceReviewReader } from "@/lib/identity/source-review";
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'cache-control':'no-store',vary:'Cookie, Authorization','x-content-type-options':'nosniff'};
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const denied=await unauthorisedResponse(request);if(denied)return denied;
 const id=z.uuid().safeParse((await params).id),paramsList=new URL(request.url).searchParams;
 const query=sourceReviewQuery.safeParse(Object.fromEntries(paramsList));
 if(!id.success||!query.success||[...paramsList.keys()].some(key=>paramsList.getAll(key).length!==1))
  return Response.json({error:'invalid_identity_inspection'},{status:400,headers});
 try{const page=await sourceReviewReader(sql)(id.data,query.data);
  return page?Response.json(page,{headers}):Response.json({error:'capture_unavailable'},{status:404,headers});
 }catch{return Response.json({error:'identity_inspection_unavailable'},{status:503,headers});}
}
