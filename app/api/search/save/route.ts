import { z } from "zod";
import { readBody, unauthorised } from "@/lib/search/http";
import { saveQuery } from "@/lib/search/saved";
import { normaliseRouted, routedQuery } from "@/lib/search/types";

export const dynamic = "force-dynamic";

const saveBody = z.object({ text: z.string().trim().min(1).max(500), routed_json: routedQuery });

export async function POST(request: Request): Promise<Response> {
  const denied = unauthorised(request);
  if (denied) return denied;
  const body = await readBody(request, saveBody);
  if ("error" in body) return body.error;

  const routed = normaliseRouted(body.data.routed_json);
  if (!routed) return Response.json({ error: "routed_json has nothing to search for" }, { status: 400 });
  return Response.json({ id: await saveQuery(body.data.text, routed) }, { status: 201 });
}
