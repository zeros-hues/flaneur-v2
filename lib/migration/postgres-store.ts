import type postgres from "postgres";
import { canonical, type BatchStore, type MigrationRow } from "./batch";

const tables = new Set(["artifact", "encounter", "encounter_object", "observation",
  "role_observation", "education_observation", "skill_observation", "relationship", "relationship_support"]);
const identifier = (name: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error("PHASE1_INVALID_IDENTIFIER");
  return `"${name}"`;
};
const value = (input: unknown): string | number | boolean | Date | null => {
  if (input === null || input instanceof Date || typeof input === "string" ||
    typeof input === "number" || typeof input === "boolean") return input;
  if (typeof input === "object") return JSON.stringify(input);
  throw new Error("PHASE1_INVALID_BIND_VALUE");
};

// No environment loading, pool creation, CLI, or application imports. A future authorized
// caller must supply a connection explicitly. Nothing imports this adapter in the app.
export function postgresBatchStore(connection: ReturnType<typeof postgres>): BatchStore {
  return { async transaction(work) {
    const result = await connection.begin("isolation level read committed", async (sql) => {
    // Serialize migration batches, including retries from competing runners.
    await sql`select pg_advisory_xact_lock(1790703955, 2)`;
    const output = await work({
      async receipt(key) {
        const rows = await sql`select fingerprint from public.migration_receipt where key = ${key}`;
        return rows[0]?.fingerprint ?? null;
      },
      async ensure(input: MigrationRow) {
        if (!tables.has(input.table) || !Object.keys(input.key).length) throw new Error("PHASE1_INVALID_TABLE");
        const fields = { ...input.values, ...input.key };
        const columns = Object.keys(fields);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(",");
        await sql.unsafe(`insert into public.${identifier(input.table)} (${columns.map(identifier).join(",")})
          values (${placeholders}) on conflict do nothing`, columns.map((c) => value(fields[c])));
        const keys = Object.keys(input.key);
        const predicates = keys.map((k, i) => `${identifier(k)} is not distinct from $${i + 1}`).join(" and ");
        const rows = await sql.unsafe(`select ${columns.map(identifier).join(",")} from public.${identifier(input.table)}
          where ${predicates}`, keys.map((k) => value(input.key[k])));
        if (rows.length !== 1 || columns.some((c) => canonical(rows[0]?.[c]) !== canonical(fields[c]))) {
          throw new Error("PHASE1_EXISTING_ROW_CONFLICT");
        }
      },
      async commitReceipt(key, fingerprint) {
        await sql`insert into public.migration_receipt (key, fingerprint) values (${key}, ${fingerprint})`;
      },
    });
    return { output };
  });
    return result.output;
  } };
}
