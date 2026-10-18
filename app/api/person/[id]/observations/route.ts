import { z } from "zod";
import { unauthorisedResponse } from "@/lib/auth";
import { sql } from "@/lib/db";
import { postgresInspectionReader } from "@/lib/review/postgres-inspection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "cache-control": "no-store", vary: "Cookie, Authorization", "x-content-type-options": "nosniff" };
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await unauthorisedResponse(request); if (denied) return denied;
  const id = z.uuid().safeParse((await params).id), cursors = new URL(request.url).searchParams.getAll("cursor");
  if (!id.success || cursors.length > 1 || (cursors.length && !z.uuid().safeParse(cursors[0]).success))
    return Response.json({ error: "invalid_inspection_request" }, { status: 400, headers });
  try {
    const page = await postgresInspectionReader(sql)(id.data, cursors[0]);
    return page ? Response.json(page, { headers }) : Response.json({ error: "person_unavailable" }, { status: 404, headers });
  } catch { return Response.json({ error: "inspection_unavailable" }, { status: 503, headers }); }
}
