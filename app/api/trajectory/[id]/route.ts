import {z} from 'zod';
import {unauthorisedResponse} from '@/lib/auth';
import {sql} from '@/lib/db';
import {trajectoryPanelQuery,trajectoryPanelReader} from '@/lib/relationships/trajectory-reader';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'cache-control':'no-store',vary:'Cookie, Authorization','x-content-type-options':'nosniff'};
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const denied=await unauthorisedResponse(request);if(denied)return denied;
 const target=z.uuid().safeParse((await params).id),values=new URL(request.url).searchParams,query=trajectoryPanelQuery.safeParse(Object.fromEntries(values));
 if(!target.success||!query.success||[...values.keys()].some(key=>values.getAll(key).length!==1))return Response.json({error:'invalid_trajectory_query'},{status:400,headers});
 try{const page=await trajectoryPanelReader(sql)(target.data,query.data);return page?Response.json(page,{headers}):Response.json({error:'person_unavailable'},{status:404,headers});}
 catch{return Response.json({error:'trajectory_unavailable'},{status:503,headers});}
}
