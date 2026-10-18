import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import * as schema from "@/db/schema";

// Server-only module: never import from client components.
const { DATABASE_URL } = z.object({ DATABASE_URL: z.url() }).parse(process.env);

type Sql = ReturnType<typeof postgres>;

// Drizzle mutates timestamp/JSON codecs; direct stores must have an independent pool.
// Cache both across hot reloads; their combined configured maximum remains ten connections.
const globalForDb = globalThis as typeof globalThis & { flaneurSql?: Sql; flaneurDirectSql?: Sql };

export const sql: Sql = globalForDb.flaneurDirectSql ?? postgres(DATABASE_URL, { max: 5 });
const ormSql: Sql = globalForDb.flaneurSql ?? postgres(DATABASE_URL, { max: 5 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.flaneurSql = ormSql;
  globalForDb.flaneurDirectSql = sql;
}

export const db = drizzle(ormSql, { schema });

export type Db = typeof db;
