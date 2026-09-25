import { isAuthorisedCapture } from "@/lib/capture/auth";
import { saveCapture } from "@/lib/capture/save";
import { captureBody } from "@/lib/capture/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorisedCapture(request.headers.get("x-capture-secret"))) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }

  const parsed = captureBody.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  const id = await saveCapture(parsed.data);
  return Response.json({ id }, { status: 200 });
}
