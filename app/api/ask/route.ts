import { z } from "zod";
import { unauthorisedResponse } from "@/lib/auth";
import { askCity } from "@/lib/ask";
import { readBody } from "@/lib/search/http";

export const dynamic = "force-dynamic";

const askBody = z.object({ question: z.string().trim().min(1).max(500) });

export async function POST(request: Request): Promise<Response> {
  const denied = unauthorisedResponse(request);
  if (denied) return denied;
  const body = await readBody(request, askBody);
  if ("error" in body) return body.error;

  try {
    return Response.json(await askCity(body.data.question));
  } catch (error) {
    console.error("[ask] failed", error);
    return Response.json({ error: "the question could not be answered" }, { status: 502 });
  }
}
