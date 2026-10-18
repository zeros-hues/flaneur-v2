import { existsSync } from "node:fs";

// Administrative tooling only. Never print environment values or connection URLs.
export function databaseUrl(key = "DATABASE_URL") {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const value = process.env[key]?.trim().replace(/^"(.*)"$/, "$1");
  if (!value) throw Object.assign(new Error("Database setting unavailable"), { code: "MISSING_DATABASE_SETTING" });
  let parsed;
  try { parsed = new URL(value); }
  catch { throw Object.assign(new Error("Invalid database setting"), { code: "INVALID_DATABASE_SETTING" }); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw Object.assign(new Error("Unsupported database URL"), { code: "INVALID_DATABASE_SETTING" });
  }
  return value;
}

export function safeFailure(error) {
  // Driver errors may contain hostnames, queries, or data. Report only a stable code.
  let current = error, code = "UNCLASSIFIED_FAILURE";
  // Drizzle can wrap a driver exception. Inspect only bounded cause codes, never messages/queries.
  for (let depth = 0; depth < 3 && current; depth++) {
    if (typeof current.code === "string" && /^[A-Z0-9_]{1,64}$/.test(current.code)) { code = current.code; break; }
    current = current.cause;
  }
  console.error(JSON.stringify({ status: "failed", code }));
}
