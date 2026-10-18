import "server-only";
import { sql } from "@/lib/db";
import { postgresOwnerSessionRuntime } from "./postgres-owner-runtime";

let runtime: ReturnType<typeof postgresOwnerSessionRuntime> | undefined;
/** Next loads private settings. One shared app pool; no DIRECT_URL runtime access. */
export function getOwnerSessionRuntime() {
  return runtime ??= postgresOwnerSessionRuntime(sql, {
    origin: process.env.OWNER_SESSION_ORIGIN ?? "",
    ownerPrincipalId: process.env.OWNER_PRINCIPAL_ID ?? "",
    passwordHash: process.env.OWNER_PASSWORD_HASH ?? "",
  });
}
