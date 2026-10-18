import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

export const SESSION_COOKIE_V2 = "__Host-flaneur-session";
export interface SessionGrant { principalId: string; permission: "read" | "write" }
export interface SessionRecord extends SessionGrant { id: string; tokenHash: string; ttlSeconds: number }
export interface SessionStore {
  create(record: SessionRecord): Promise<{ expiresAt: string }>;
  /** Store checks expiry/revocation using its authoritative clock on every request. */
  lookup(tokenHash: string): Promise<SessionGrant | null>;
  revoke(tokenHash: string): Promise<void>;
  revokeAll(principalId: string): Promise<void>;
}
const issueSchema = z.object({ principalId: z.uuid(), permission: z.enum(["read", "write"]),
  ttlSeconds: z.number().int().min(60).max(2592000).default(604800) }).strict();
function hashToken(raw: unknown) {
  if (typeof raw !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const bytes = Buffer.from(raw, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== raw) return null;
  return createHash("sha256").update(raw).digest("hex");
}

/** Only call after a trusted login provider verified the owner and granted permission. No HTTP issuer is enabled. */
export async function issueSession(raw: unknown, store: SessionStore) {
  const parsed = issueSchema.parse(raw), token = randomBytes(32).toString("base64url");
  const record: SessionRecord = { ...parsed, principalId: parsed.principalId.toLowerCase(), id: randomUUID(), tokenHash: hashToken(token)! };
  const { expiresAt } = await store.create(record);
  return { token, expiresAt, cookie: { name: SESSION_COOKIE_V2, httpOnly: true, secure: true,
    sameSite: "strict" as const, path: "/", maxAge: parsed.ttlSeconds } };
}
export async function authenticateSession(raw: unknown, store: SessionStore, required: "read" | "write" = "read") {
  const hash = hashToken(raw);
  if (!hash) return null;
  const grant = await store.lookup(hash);
  if (!grant || (required === "write" && grant.permission !== "write")) return null;
  return z.object({ principalId: z.uuid(), permission: z.enum(["read", "write"]) }).strict().parse(grant);
}
export async function revokeSession(raw: unknown, store: SessionStore) {
  const hash = hashToken(raw);
  if (hash) await store.revoke(hash);
}
/** Caller obtains this principal from verified auth, never from an untrusted logout payload. */
export async function revokePrincipalSessions(principalId: string, store: SessionStore) {
  await store.revokeAll(z.uuid().parse(principalId).toLowerCase());
}
export function sessionCookie(request: Request) {
  const values = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim())
    .filter((part) => part.split("=", 1)[0] === SESSION_COOKIE_V2).map((part) => part.slice(part.indexOf("=") + 1));
  return values.length === 1 && hashToken(values[0]) ? values[0]! : null;
}
/** Suitable for the prepared review boundary; no capture-secret/header fallback. */
export function sessionAuthorizer(store: SessionStore, required: "read" | "write" = "write") {
  return async (request: Request) => !!await authenticateSession(sessionCookie(request), store, required);
}
