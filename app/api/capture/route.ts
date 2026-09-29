import { isAuthorisedCapture } from "@/lib/capture/auth";
import { saveCapture } from "@/lib/capture/save";
import { captureBody } from "@/lib/capture/schema";
import { db } from "@/lib/db";
import { processSnapshot, type ParseResult } from "@/lib/parsers/run";

export const dynamic = "force-dynamic";

function summaryOf(result: ParseResult | null): string {
  if (!result) return "Saved, but parsing failed unexpectedly. Run reparse once it is fixed.";
  if (result.status === "merged") return result.diff.summary;
  if (result.status === "quarantined") return `Saved, but quarantined: ${result.reason}`;
  return result.summary;
}

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

  // The snapshot is committed first; parsing and merging run in their own transaction.
  const stored = await saveCapture(parsed.data);
  let result: ParseResult | null = null;
  try {
    result = await db.transaction((tx) => processSnapshot(tx, stored, parsed.data.html, "mark"));
  } catch (error) {
    console.error(`[capture] parse of snapshot ${stored.id} failed`, error);
  }

  return Response.json({ id: stored.id, parse: result, summary: summaryOf(result) }, { status: 200 });
}
