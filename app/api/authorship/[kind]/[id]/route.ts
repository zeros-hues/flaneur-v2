import {unauthorisedResponse} from '@/lib/auth';
import {sql} from '@/lib/db';
import {authorshipPanelTarget,authorshipPanelQuery,authorshipPanelReader} from '@/lib/relationships/authorship-panels';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'cache-control':'no-store',vary:'Cookie, Authorization','x-content-type-options':'nosniff'};
export async function GET(request:Request,{params}:{params:Promise<{kind:string;id:string}>}){
 const denied=await unauthorisedResponse(request);if(denied)return denied;
 const target=authorshipPanelTarget.safeParse(await params),values=new URL(request.url).searchParams;
 const query=authorshipPanelQuery.safeParse(Object.fromEntries(values));
 if(!target.success||!query.success||[...values.keys()].some(key=>values.getAll(key).length!==1))
  return Response.json({error:'invalid_authorship_panel'},{status:400,headers});
 try{const page=await authorshipPanelReader(sql)(target.data.kind,target.data.id,query.data);
  return page?Response.json(page,{headers}):Response.json({error:'object_unavailable'},{status:404,headers});
 }catch{return Response.json({error:'authorship_panel_unavailable'},{status:503,headers});}
}
