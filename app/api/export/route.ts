import { getNotebookDownload } from "@/lib/export/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    return await getNotebookDownload()(request);
  } catch {
    return Response.json({ error: "export_unavailable" }, { status: 503, headers: {
      "cache-control": "no-store", vary: "Cookie, Authorization", "x-content-type-options": "nosniff",
    } });
  }
}
