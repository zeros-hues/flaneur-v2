import {z} from 'zod';
import {unauthorisedResponse} from '@/lib/auth';
import {sql} from '@/lib/db';
import {sourceReviewQuery} from '@/lib/identity/source-review';
import {authorshipReviewReader} from '@/lib/relationships/authorship-reader';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'cache-control':'no-store',vary:'Cookie, Authorization','x-content-type-options':'nosniff'};
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const denied=await unauthorisedResponse(request);if(denied)return denied;
 const id=z.uuid().safeParse((await params).id),values=new URL(request.url).searchParams;
 const query=sourceReviewQuery.safeParse(Object.fromEntries(values));
 if(!id.success||!query.success||[...values.keys()].some(key=>values.getAll(key).length!==1))
  return Response.json({error:'invalid_authorship_inspection'},{status:400,headers});
 try{const page=await authorshipReviewReader(sql)(id.data,query.data);
  return page?Response.json(page,{headers}):Response.json({error:'capture_unavailable'},{status:404,headers});
 }catch{return Response.json({error:'authorship_inspection_unavailable'},{status:503,headers});}
}
