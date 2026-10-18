import postgres from "postgres";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { databaseUrl, safeFailure } from "../phase0/environment.mjs";

// Explicit administrative entrypoint. No app imports, backfill, capture, worker or provider calls.
let client;
let stage = "connection";
let statementIndex = null;
try {
  client = postgres(databaseUrl("DIRECT_URL"), { max: 1, connect_timeout: 15, idle_timeout: 5, onnotice: () => {} });
  const local = readMigrationFiles({ migrationsFolder: "db/migrations" });
  const result = await client.begin("isolation level read committed", async (sql) => {
    await sql`set local statement_timeout = '60s'`;
    await sql`set local lock_timeout = '10s'`;
    await sql`select pg_advisory_xact_lock(1790703955, 2)`;
    stage = "ledger";
    const [ledger] = await sql`select to_regclass('drizzle.__drizzle_migrations') is not null as present`;
    if (!ledger.present) throw Object.assign(new Error("Expected legacy baseline"), { code: "MIGRATION_BASELINE_MISSING" });
    const applied = await sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at`;
    if (applied.length < 6 || applied.some((entry, index) => entry.hash !== local[index]?.hash ||
      Number(entry.created_at) !== local[index]?.folderMillis))
      throw Object.assign(new Error("Migration prefix mismatch"), { code: "MIGRATION_LEDGER_CONFLICT" });
    const pending = local.slice(applied.length);
    for (const [offset, migration] of pending.entries()) {
      stage = `migration_${String(applied.length + offset).padStart(4, "0")}`;
      for (const [index, statement] of migration.sql.entries()) {
        statementIndex = index;
        await sql.unsafe(statement);
      }
      await sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${migration.hash}, ${migration.folderMillis})`;
    }
    stage = "deferred_constraints";
    statementIndex = null;
    await sql`set constraints all immediate`;
    return { status: "migrations_committed", connection_setting: "DIRECT_URL", previous_count: applied.length,
      applied_count: pending.length, total_count: local.length };
  });
  console.log(JSON.stringify(result));
} catch (error) {
  // Report stage/index and stable code only. Never emit SQL, driver messages, stack traces or URLs.
  console.error(JSON.stringify({ stage, statement_index: statementIndex }));
  safeFailure(error); process.exitCode = 1;
} finally { await client?.end({ timeout: 2 }); }
