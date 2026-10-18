import { z } from "zod";
import { issueSession, authenticateSession, sessionCookie, revokeSession, revokePrincipalSessions,
  SESSION_COOKIE_V2, type SessionGrant, type SessionStore } from "./service";

const credential = z.string().min(1).max(1024).refine((text) => !text.includes("\0") &&
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text));
const schema = z.discriminatedUnion("action", [z.object({ action: z.literal("login"), credential }).strict(),
  z.object({ action: z.literal("logout") }).strict(), z.object({ action: z.literal("logout_all") }).strict()]);
const grantSchema = z.object({ principalId: z.uuid(), permission: z.enum(["read", "write"]) }).strict();
export interface LoginProvider { verify(credential: string): Promise<SessionGrant | null> }
function response(body: unknown, status: number, extra: Record<string, string> = {}) {
  const headers = { "cache-control": "no-store", vary: "Cookie, Authorization", "x-content-type-options": "nosniff", ...extra };
  return status === 204 ? new Response(null, { status, headers }) : Response.json(body, { status, headers });
}
const clearCookie = `${SESSION_COOKIE_V2}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
async function readBody(request: Request) {
  if (!request.body) throw new Error("INVALID_BODY");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel().catch(() => {}); throw new Error("BODY_TOO_LARGE"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } finally { reader.releaseLock(); }
}

/** Prepared only. Provider verifies the owner; throttle must be configured before any live login. */
export function sessionHandler(store: SessionStore, provider: LoginProvider, policy: {
  origin: string; ownerPrincipalId: string; allowLogin(request: Request): Promise<boolean>;
}) {
  let origin: URL;
  try { origin = new URL(policy.origin); } catch { throw new Error("INVALID_SESSION_ORIGIN"); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash)
    throw new Error("INVALID_SESSION_ORIGIN");
  const owner = z.uuid().parse(policy.ownerPrincipalId).toLowerCase();
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405, { allow: "POST" });
    if (request.headers.get("origin") !== origin.origin) return response({ error: "origin_not_allowed" }, 403);
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json")
      return response({ error: "json_required" }, 415);
    let input: z.infer<typeof schema>;
    try { input = schema.parse(await readBody(request)); }
    catch (error) { return response({ error: "invalid_session_request" },
      error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400); }
    try {
      if (input.action === "login") {
        if (!await policy.allowLogin(request)) return response({ error: "login_throttled" }, 429);
        const verified = await provider.verify(input.credential);
        if (!verified) return response({ error: "unauthorised" }, 401);
        const grant = grantSchema.parse(verified);
        if (grant.principalId.toLowerCase() !== owner) return response({ error: "unauthorised" }, 401);
        const issued = await issueSession({ ...grant, principalId: owner }, store);
        const cookie = `${SESSION_COOKIE_V2}=${issued.token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${issued.cookie.maxAge}`;
        return response({ authenticated: true, expiresAt: issued.expiresAt }, 200, { "set-cookie": cookie });
      }
      const token = sessionCookie(request);
      if (input.action === "logout_all") {
        const grant = await authenticateSession(token, store);
        if (!grant || grant.principalId.toLowerCase() !== owner) return response({ error: "unauthorised" }, 401);
        await revokePrincipalSessions(grant.principalId, store);
      } else {
        // Possession revokes only this opaque token; missing/expired cookies still clear locally.
        await revokeSession(token, store);
      }
      return response(null, 204, { "set-cookie": clearCookie });
    } catch { return response({ error: "session_unavailable" }, 503); }
  };
}
