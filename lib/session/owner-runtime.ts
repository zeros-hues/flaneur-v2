import { z } from "zod";
import { sessionHandler } from "./handler";
import { ownerPasswordProvider } from "./password";
import { ownerLoginThrottle, type LoginThrottleStore } from "./throttle";
import { authenticateSession, sessionCookie, type SessionStore } from "./service";

export interface OwnerSessionConfiguration {
  origin: string; ownerPrincipalId: string; passwordHash: string;
  maxAttempts?: number; windowSeconds?: number;
}
function trustedOrigin(raw: string) {
  const value = new URL(raw);
  if (value.protocol !== "https:" || value.username || value.password || value.pathname !== "/" || value.search || value.hash)
    throw new Error("OWNER_SESSION_CONFIGURATION_INVALID");
  return value.origin;
}
/** Server composition only: supplied stores/configuration, no environment loading or route activation. */
export function ownerSessionRuntime(stores: { sessions: SessionStore; throttle: LoginThrottleStore }, config: OwnerSessionConfiguration) {
  try {
    const origin = trustedOrigin(config.origin), ownerPrincipalId = z.uuid().parse(config.ownerPrincipalId).toLowerCase();
    const provider = ownerPasswordProvider({ ownerPrincipalId, passwordHash: config.passwordHash });
    const allowLogin = ownerLoginThrottle(stores.throttle, { ownerPrincipalId,
      maxAttempts: config.maxAttempts, windowSeconds: config.windowSeconds });
    return {
      handleSession: sessionHandler(stores.sessions, provider, { origin, ownerPrincipalId, allowLogin }),
      async authorize(request: Request, required: "read" | "write" = "write") {
        const grant = await authenticateSession(sessionCookie(request), stores.sessions, required);
        return !!grant && grant.principalId.toLowerCase() === ownerPrincipalId;
      },
    };
  } catch { throw new Error("OWNER_SESSION_CONFIGURATION_INVALID"); }
}

/** Accept already Next-loaded environment values; report booleans only, with no credential verification/write. */
export function ownerSessionReadiness(env: Readonly<Record<string, string | undefined>>) {
  let ownerPasswordConfigured = false, originConfigured = false, runtimeDatabaseConfigured = false;
  try {
    ownerPasswordProvider({ ownerPrincipalId: env.OWNER_PRINCIPAL_ID ?? "", passwordHash: env.OWNER_PASSWORD_HASH ?? "" });
    ownerPasswordConfigured = true;
  } catch { /* No raw validation errors or values escape. */ }
  try { trustedOrigin(env.OWNER_SESSION_ORIGIN ?? ""); originConfigured = true; } catch { /* Private configuration. */ }
  try { runtimeDatabaseConfigured = ["postgres:", "postgresql:"].includes(new URL(env.DATABASE_URL ?? "").protocol); } catch { /* Private configuration. */ }
  return { ownerPasswordConfigured, originConfigured, runtimeDatabaseConfigured,
    configurationReady: ownerPasswordConfigured && originConfigured && runtimeDatabaseConfigured };
}
