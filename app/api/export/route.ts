import { unauthorisedResponse } from "@/lib/auth";
import { exportEverything, exportFilename } from "@/lib/export";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = unauthorisedResponse(request);
  if (denied) return denied;
  try {
    return new Response(JSON.stringify(await exportEverything(), null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFilename()}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[export] failed", error);
    return Response.json({ error: "the export could not be built" }, { status: 502 });
  }
}
