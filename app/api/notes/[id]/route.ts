import { unauthorised } from "@/lib/search/http";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request): Promise<Response> {
  const denied = await unauthorised(request);
  if (denied) return denied;
  return Response.json({error:"immutable_revision_required"},{status:410,headers:{"cache-control":"no-store"}});
}
