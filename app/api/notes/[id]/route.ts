import { z } from "zod";
import { noteBody, updateNote } from "@/lib/notes";
import { readBody, unauthorised } from "@/lib/search/http";

export const dynamic = "force-dynamic";

const patchBody = z.object({ body: noteBody });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const denied = unauthorised(request);
  if (denied) return denied;
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return Response.json({ error: "invalid note id" }, { status: 400 });
  const body = await readBody(request, patchBody);
  if ("error" in body) return body.error;

  const updated = await updateNote(id.data, body.data.body);
  if (!updated) return Response.json({ error: "note not found" }, { status: 404 });
  return Response.json(updated);
}
