import { z } from "zod";
import { createNote, noteBody } from "@/lib/notes";
import { readBody, unauthorised } from "@/lib/search/http";

export const dynamic = "force-dynamic";

const createBody = z.object({ personId: z.uuid(), body: noteBody });

export async function POST(request: Request): Promise<Response> {
  const denied = unauthorised(request);
  if (denied) return denied;
  const body = await readBody(request, createBody);
  if ("error" in body) return body.error;

  const created = await createNote(body.data.personId, body.data.body);
  if (!created) return Response.json({ error: "person not found" }, { status: 404 });
  return Response.json(created, { status: 201 });
}
