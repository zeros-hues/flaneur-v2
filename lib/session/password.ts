import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { LoginProvider } from "./handler";

// Fixed versioned profile, avoiding caller-controlled cost parameters or unbounded work.
const PREFIX = "flaneur-scrypt-v1";
const OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function validPassword(raw: unknown): raw is string {
  return typeof raw === "string" && raw.length > 0 && raw.length <= 1024 && !raw.includes("\0") &&
    !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(raw);
}
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 32, OPTIONS,
    (error, key) => error ? reject(new Error("PASSWORD_HASH_UNAVAILABLE")) : resolve(key)));
}
function parsedHash(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 100) throw new Error("PASSWORD_CONFIGURATION_INVALID");
  const [version, encodedSalt, encodedKey, extra] = raw.split("$");
  if (version !== PREFIX || extra !== undefined || !/^[A-Za-z0-9_-]{22}$/.test(encodedSalt ?? "") ||
      !/^[A-Za-z0-9_-]{43}$/.test(encodedKey ?? "")) throw new Error("PASSWORD_CONFIGURATION_INVALID");
  const salt = Buffer.from(encodedSalt!, "base64url"), key = Buffer.from(encodedKey!, "base64url");
  if (salt.length !== 16 || key.length !== 32 || salt.toString("base64url") !== encodedSalt || key.toString("base64url") !== encodedKey)
    throw new Error("PASSWORD_CONFIGURATION_INVALID");
  return { salt, key };
}
/** Local trusted enrollment helper. Never log the password or returned hash; no CLI/credential is configured. */
export async function createOwnerPasswordHash(raw: unknown) {
  if (!validPassword(raw) || Array.from(raw).length < 15) throw new Error("PASSWORD_ENROLLMENT_INVALID");
  const salt = randomBytes(16), key = await derive(raw, salt);
  return `${PREFIX}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
/** Private owner password only. No capture-secret fallback, environment loading or client-supplied owner/grant. */
export function ownerPasswordProvider(config: { ownerPrincipalId: string; passwordHash: string }): LoginProvider {
  const principalId = z.uuid().parse(config.ownerPrincipalId).toLowerCase(), { salt, key } = parsedHash(config.passwordHash);
  return { async verify(credential) {
    if (!validPassword(credential)) return null;
    const actual = await derive(credential, salt);
    return timingSafeEqual(actual, key) ? { principalId, permission: "write" } : null;
  } };
}
