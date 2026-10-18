import { defineConfig } from "drizzle-kit";

// Administrative connections use DIRECT_URL only. Generation does not require a connection.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the environment.
}

// Node's loader keeps the quotes when .env is written as `KEY = "value"`.
const databaseUrl = (process.env.DIRECT_URL ?? "").trim().replace(/^"(.*)"$/, "$1");
if (!databaseUrl && process.argv.includes("migrate")) throw new Error("DIRECT_URL_REQUIRED");
if (databaseUrl) {
  let valid = false;
  try { valid = ["postgres:", "postgresql:"].includes(new URL(databaseUrl).protocol); } catch { /* Never expose the URL. */ }
  if (!valid) throw new Error("DIRECT_URL_INVALID");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dbCredentials: { url: databaseUrl },
});
