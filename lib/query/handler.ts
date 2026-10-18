import { z } from "zod";

const input = z.object({ query: z.string().trim().min(1).max(500) }).strict();
const headers = { "cache-control": "no-store", vary: "Cookie, Authorization", "x-content-type-options": "nosniff" };

/** Authorization includes the configured owner session and exact HTTPS origin. */
export function memoryQueryHandler(deps: {
  authorize(request: Request): Promise<Response | null>;
  run(question: string): Promise<unknown>;
}) {
  return async (request: Request): Promise<Response> => {
    const reply = (error: string, status: number) => Response.json({ error }, { status, headers });
    if (request.method !== "POST") return reply("method_not_allowed", 405);
    try {
      const denied = await deps.authorize(request);
      if (denied) return denied;
    } catch { return reply("query_unavailable", 503); }
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json")
      return reply("json_required", 415);
    const reader = request.body?.getReader();
    if (!reader) return reply("invalid_query", 400);
    let question: string;
    try {
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 8192) { await reader.cancel().catch(() => {}); return reply("query_too_large", 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      question = input.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))).query;
    } catch { return reply("invalid_query", 400); }
    finally { reader.releaseLock(); }
    try { return Response.json(await deps.run(question), { headers }); }
    catch { return reply("query_unavailable", 503); }
  };
}
