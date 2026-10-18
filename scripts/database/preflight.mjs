import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { databaseUrl, safeFailure } from "../phase0/environment.mjs";

// DIRECT_URL only; no application imports, private data, hostnames, URLs or driver messages in output.
let client;
try {
  client = postgres(databaseUrl("DIRECT_URL"), { max: 1, connect_timeout: 15, idle_timeout: 5, onnotice: () => {} });
  const report = await client.begin("isolation level repeatable read read only", async (sql) => {
    await sql`set local statement_timeout = '15s'`;
    const [guard] = await sql`select current_setting('transaction_read_only') as read_only,
      current_setting('server_version') as server_version`;
    if (guard.read_only !== "on") throw Object.assign(new Error("Read-only required"), { code: "READ_ONLY_GUARD" });
    const [ledger] = await sql`select to_regclass('drizzle.__drizzle_migrations') is not null as present`;
    const applied = ledger.present ? await sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at` : [];
    const journal = JSON.parse(readFileSync("db/migrations/meta/_journal.json", "utf8"));
    const local = journal.entries.map((entry) => ({ ...entry,
      hash: createHash("sha256").update(readFileSync(`db/migrations/${entry.tag}.sql`)).digest("hex") }));
    const aligned = applied.every((entry, index) => local[index]?.hash === entry.hash && local[index]?.when === Number(entry.created_at));
    const tables = await sql`select count(*)::int as count from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`;
    const extensions = await sql`select extname, extversion from pg_extension order by extname`;
    const [primitives] = await sql`select encode(sha256(convert_to('validation', 'UTF8')), 'hex') is not null as sha256_available`;
    return { connection_setting: "DIRECT_URL", read_only: guard.read_only, server_version: guard.server_version,
      public_table_count: tables[0].count, extensions, sha256_available: primitives.sha256_available,
      applied_migrations: applied.length, ledger_matches_local_prefix: aligned,
      pending_migrations: aligned ? local.slice(applied.length).map((entry) => entry.tag) : [],
      status: !aligned ? "migration_ledger_conflict" : applied.length === local.length ? "migrations_current" : "ready_for_reviewed_migration" };
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ledger_matches_local_prefix) process.exitCode = 1;
} catch (error) { safeFailure(error); process.exitCode = 1; }
finally { await client?.end({ timeout: 2 }); }
