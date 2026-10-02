import { z } from "zod";
import { readBody, unauthorised } from "@/lib/search/http";
import { draftHello } from "@/lib/walk/hello";

export const dynamic = "force-dynamic";

const helloBody = z.object({ artifactId: z.uuid() });

export async function POST(request: Request): Promise<Response> {
  const denied = unauthorised(request);
  if (denied) return denied;
  const body = await readBody(request, helloBody);
  if ("error" in body) return body.error;

  try {
    const draft = await draftHello(body.data.artifactId);
    if (!draft) return Response.json({ error: "no person behind this item" }, { status: 404 });
    return Response.json(draft);
  } catch (error) {
    console.error("[walk/hello] failed", error);
    return Response.json({ error: "the draft could not be written" }, { status: 502 });
  }
}
