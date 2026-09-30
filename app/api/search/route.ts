import { z } from "zod";
import { runSearch } from "@/lib/search";
import { readBody, unauthorised } from "@/lib/search/http";
import { normaliseRouted, routedQuery } from "@/lib/search/types";

export const dynamic = "force-dynamic";

// routed_json, when present, is a corrected routing from a previous response: routing is skipped.
const searchBody = z
  .object({ query: z.string().trim().min(1).max(500).optional(), routed_json: routedQuery.optional() })
  .refine((b) => b.query !== undefined || b.routed_json !== undefined, { message: "query or routed_json is required" });

export async function POST(request: Request): Promise<Response> {
  const denied = unauthorised(request);
  if (denied) return denied;
  const body = await readBody(request, searchBody);
  if ("error" in body) return body.error;

  const { query, routed_json } = body.data;
  const result = routed_json
    ? await runSearch({ routed: normaliseRouted(routed_json) })
    : await runSearch({ query: query ?? "" });
  return Response.json(result);
}
