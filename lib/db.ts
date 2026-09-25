import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import * as schema from "@/db/schema";

// Server-only module: never import from client components.
const { DATABASE_URL } = z.object({ DATABASE_URL: z.url() }).parse(process.env);

type Sql = ReturnType<typeof postgres>;

// Reuse one pool across dev hot reloads instead of leaking a new one per reload.
const globalForDb = globalThis as typeof globalThis & { flaneurSql?: Sql };

const sql: Sql = globalForDb.flaneurSql ?? postgres(DATABASE_URL, { max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.flaneurSql = sql;
}

export const db = drizzle(sql, { schema });

export type Db = typeof db;
