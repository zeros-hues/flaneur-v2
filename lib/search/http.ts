// Shared request handling for the search routes.
import { z } from "zod";
import { unauthorisedResponse } from "@/lib/auth";

// Header (scripts) or session cookie (dashboard); see lib/auth.ts.
export const unauthorised = unauthorisedResponse;

/** Parses a JSON body against `schema`, or returns the 400 response to send. */
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<{ data: T } | { error: Response }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { error: Response.json({ error: "body must be JSON" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { error: Response.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 }) };
  }
  return { data: parsed.data };
}
