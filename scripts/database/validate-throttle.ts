import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { fixtureConnection, type Connection } from "./fixture-connection";
import { postgresLoginThrottleStore } from "../../lib/session/postgres-throttle";
import { markValidationStage } from "./validation-stage";
import { exportCatalog } from "../../lib/export/postgres-v2";

async function state(connection: Connection) {
  return connection.begin("isolation level repeatable read read only", async (sql) => {
    const [table] = await sql`select to_regclass('auth.login_throttle') is not null as exists`;
    if (!table!.exists) return { exists: false, fingerprint: null };
    const [row] = await sql`select encode(sha256(convert_to(coalesce(string_agg(row_to_json(t)::text, '|' order by bucket_key), ''), 'UTF8')), 'hex') as fingerprint
      from auth.login_throttle t`;
    return { exists: true, fingerprint: row!.fingerprint as string };
  });
}
export async function validateThrottle(connection: Connection) {
  const before = await state(connection), rollback = new Error("THROTTLE_FIXTURE_ROLLBACK"); let checks = 0;
  markValidationStage("owner_login_throttle");
  try {
    await connection.begin("isolation level read committed", async (sql) => {
      await sql`set local statement_timeout = '20s'`; await sql`set local lock_timeout = '5s'`;
      if (!before.exists) {
        for (const statement of readFileSync("db/migrations/0015_shared_login_throttle.sql", "utf8").split("--> statement-breakpoint"))
          if (statement.trim()) await sql.unsafe(statement);
      }
      const bucketKey = createHash("sha256").update(randomUUID()).digest("hex");
      const independent = createHash("sha256").update(randomUUID()).digest("hex");
      const store = postgresLoginThrottleStore(fixtureConnection(sql));
      const policy = { bucketKey, maxAttempts: 2, windowSeconds: 60 };
      assert.equal(await store.consume(policy), true); checks++;
      assert.equal(await store.consume(policy), true); checks++;
      const [full] = await sql`select attempts, window_started_at from auth.login_throttle where bucket_key = ${bucketKey}`;
      assert.equal(full!.attempts, 2); checks++;
      for (let i = 0; i < 3; i++) { assert.equal(await store.consume(policy), false); checks++; }
      const [denied] = await sql`select attempts, window_started_at from auth.login_throttle where bucket_key = ${bucketKey}`;
      assert.deepEqual(denied, full); checks++;
      assert.equal(await store.consume({ ...policy, bucketKey: independent }), true); checks++;
      await assert.rejects(store.consume({ ...policy, maxAttempts: 3 }), /LOGIN_THROTTLE_POLICY_MISMATCH/); checks++;
      await assert.rejects(store.consume({ ...policy, windowSeconds: 120 }), /LOGIN_THROTTLE_POLICY_MISMATCH/); checks++;
      await sql`update auth.login_throttle set window_started_at = clock_timestamp() - interval '61 seconds' where bucket_key = ${bucketKey}`;
      assert.equal(await store.consume(policy), true); checks++;
      const [reset] = await sql`select attempts, window_started_at > clock_timestamp() - interval '5 seconds' as recent
        from auth.login_throttle where bucket_key = ${bucketKey}`;
      assert.equal(reset!.attempts, 1); assert.equal(reset!.recent, true); checks += 2;
      async function rejected(work: () => Promise<unknown>) {
        let code: unknown;
        try { await sql.savepoint(async () => work()); }
        catch (error) { code = error && typeof error === "object" && "code" in error ? error.code : null; }
        assert.equal(code, "23514"); checks++;
      }
      await rejected(() => sql`update auth.login_throttle set attempts = 3 where bucket_key = ${bucketKey}`);
      await rejected(() => sql`update auth.login_throttle set attempts = -1 where bucket_key = ${bucketKey}`);
      await rejected(() => sql`update auth.login_throttle set max_attempts = 101 where bucket_key = ${bucketKey}`);
      await rejected(() => sql`update auth.login_throttle set window_seconds = 59 where bucket_key = ${bucketKey}`);
      await rejected(() => sql`update auth.login_throttle set bucket_key = 'invalid' where bucket_key = ${bucketKey}`);
      assert.ok([38,41].includes((await exportCatalog(sql)).length)); checks++;
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  assert.deepEqual(await state(connection), before); checks++;
  return { checks, schemaMode: before.exists ? "existing_schema" : "rollback_ddl", throttleStateUnchanged: true };
}
