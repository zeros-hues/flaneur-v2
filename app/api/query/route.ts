import { z } from "zod";
import { readBody, unauthorised } from "@/lib/search/http";
import { runQuery } from "@/lib/search/unified";

export const dynamic = "force-dynamic";

const queryBody = z.object({ query: z.string().trim().min(1).max(500) });

export async function POST(request: Request): Promise<Response> {
  const denied = unauthorised(request);
  if (denied) return denied;
  const body = await readBody(request, queryBody);
  if ("error" in body) return body.error;

  try {
    return Response.json(await runQuery(body.data.query));
  } catch (error) {
    console.error("[query] failed", error);
    return Response.json({ error: "the query could not be answered" }, { status: 502 });
  }
}
