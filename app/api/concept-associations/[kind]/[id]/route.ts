import {unauthorisedResponse} from '@/lib/auth';
import {sql} from '@/lib/db';
import {conceptPanelTarget,conceptPanelQuery,conceptPanelReader} from '@/lib/relationships/concept-reader';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'cache-control':'no-store',vary:'Cookie, Authorization','x-content-type-options':'nosniff'};
export async function GET(request:Request,{params}:{params:Promise<{kind:string;id:string}>}){
 const denied=await unauthorisedResponse(request);if(denied)return denied;
 const target=conceptPanelTarget.safeParse(await params),values=new URL(request.url).searchParams,query=conceptPanelQuery.safeParse(Object.fromEntries(values));
 if(!target.success||!query.success||[...values.keys()].some(key=>values.getAll(key).length!==1)||
  (target.data.kind==='concept'&&(query.data.q||query.data.searchCursor)))return Response.json({error:'invalid_concept_association_query'},{status:400,headers});
 try{const page=await conceptPanelReader(sql)(target.data.kind,target.data.id,query.data);
  return page?Response.json(page,{headers}):Response.json({error:'object_unavailable'},{status:404,headers});
 }catch{return Response.json({error:'concept_associations_unavailable'},{status:503,headers});}
}
