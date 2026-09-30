import { z } from "zod";
import { unauthorised } from "@/lib/search/http";
import { runSavedQuery } from "@/lib/search/saved";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const denied = unauthorised(request);
  if (denied) return denied;

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return Response.json({ error: "invalid saved query id" }, { status: 400 });

  const result = await runSavedQuery(id.data);
  if (!result) return Response.json({ error: "saved query not found" }, { status: 404 });
  return Response.json(result);
}
