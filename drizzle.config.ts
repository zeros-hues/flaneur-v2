import { defineConfig } from "drizzle-kit";

// drizzle-kit does not load .env itself. `generate` works without it; `migrate` needs DATABASE_URL.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the environment.
}

// Node's loader keeps the quotes when .env is written as `KEY = "value"`.
const databaseUrl = (process.env.DATABASE_URL ?? "").trim().replace(/^"(.*)"$/, "$1");

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dbCredentials: { url: databaseUrl },
});
