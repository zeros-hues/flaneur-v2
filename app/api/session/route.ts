import { getOwnerSessionRuntime } from "@/lib/session/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  try { return await getOwnerSessionRuntime().handleSession(request); }
  catch { return Response.json({ error: "session_unavailable" }, { status: 503,
    headers: { "cache-control": "no-store", vary: "Cookie, Authorization", "x-content-type-options": "nosniff" } }); }
}
