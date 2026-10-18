import { z } from "zod";
import { buildMemoryExport, type ExportSource } from "./v2";
import { authenticateSession, sessionCookie, type SessionStore } from "../session/service";

const privateHeaders = { "cache-control": "no-store", vary: "Cookie, Authorization", "x-content-type-options": "nosniff" };
const failure = (error: string, status: number, extra: Record<string, string> = {}) =>
  Response.json({ error }, { status, headers: { ...privateHeaders, ...extra } });

/** Prepared private download factory. Never loads a pool/configuration or changes the live export route. */
export function memoryExportHandler(source: ExportSource, sessions: SessionStore, policy: {
  origin: string; ownerPrincipalId: string; limits?: { maxRows?: number; maxBytes?: number };
}) {
  let origin: URL;
  try { origin = new URL(policy.origin); } catch { throw new Error("INVALID_EXPORT_ORIGIN"); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash)
    throw new Error("INVALID_EXPORT_ORIGIN");
  const owner = z.uuid().parse(policy.ownerPrincipalId).toLowerCase();
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET") return failure("method_not_allowed", 405, { allow: "GET" });
    const suppliedOrigin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
    if (["same-site", "cross-site"].includes(site ?? "") || (suppliedOrigin !== null ? suppliedOrigin !== origin.origin :
      !["same-origin", "none"].includes(site ?? ""))) return failure("origin_not_allowed", 403);
    try {
      const grant = await authenticateSession(sessionCookie(request), sessions);
      if (!grant || grant.principalId.toLowerCase() !== owner) return failure("unauthorised", 401);
      const data = await buildMemoryExport(source, policy.limits), body = JSON.stringify(data);
        const filename = `flaneur-memory-v${data.version}-${data.capturedAt.slice(0, 10)}.json`;
      return new Response(body, { headers: { ...privateHeaders, "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`, "content-length": String(Buffer.byteLength(body)) } });
    } catch (error) {
      return failure(error instanceof Error && error.message === "EXPORT_SIZE_LIMIT" ? "export_size_limit" : "export_unavailable", 503);
    }
  };
}
