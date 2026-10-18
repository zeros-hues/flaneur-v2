import {z} from 'zod';
import {unauthorisedResponse} from '@/lib/auth';
import {sql} from '@/lib/db';
import {profileRelationshipsReader} from '@/lib/relationships/profile-reader';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'cache-control':'no-store',vary:'Cookie, Authorization','x-content-type-options':'nosniff'};
export async function GET(request:Request,{params}:{params:Promise<{kind:string;id:string}>}){
 const denied=await unauthorisedResponse(request);if(denied)return denied;
 const parsed=z.object({kind:z.enum(['person','artifact']),id:z.uuid()}).safeParse(await params),query=new URL(request.url).searchParams;
 if(!parsed.success||[...query.keys()].some(key=>key!=='cursor'||query.getAll(key).length!==1)||
  (query.has('cursor')&&!z.uuid().safeParse(query.get('cursor')).success))return Response.json({error:'invalid_relationship_inspection'},{status:400,headers});
 try{const page=await profileRelationshipsReader(sql)(parsed.data.kind,parsed.data.id,query.get('cursor')??undefined);
  return page?Response.json(page,{headers}):Response.json({error:'object_unavailable'},{status:404,headers});
 }catch{return Response.json({error:'relationship_inspection_unavailable'},{status:503,headers});}
}
