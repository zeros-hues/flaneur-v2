import { z } from "zod";
import { unauthorisedResponse } from "@/lib/auth";
import { readBody } from "@/lib/search/http";
import { answerWalkItem, WALK_ACTIONS } from "@/lib/walk/actions";

export const dynamic = "force-dynamic";

const walkBody = z.object({ artifactId: z.uuid(), action: z.enum(WALK_ACTIONS) });

export async function POST(request: Request): Promise<Response> {
  const denied = unauthorisedResponse(request);
  if (denied) return denied;
  const body = await readBody(request, walkBody);
  if ("error" in body) return body.error;

  const found = await answerWalkItem(body.data.artifactId, body.data.action);
  if (!found) return Response.json({ error: "item not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
