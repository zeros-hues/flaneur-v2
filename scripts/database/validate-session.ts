import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import type postgres from "postgres";
import { fixtureConnection, type Connection } from "./fixture-connection";
import { markValidationStage } from "./validation-stage";
import { postgresSessionStore } from "../../lib/session/postgres";
import { issueSession, authenticateSession, revokeSession, revokePrincipalSessions } from "../../lib/session/service";
import { exportCatalog } from "../../lib/export/postgres-v2";

async function sessionState(connection: Connection) {
  return connection.begin("isolation level repeatable read read only", async (sql) => {
    await sql`set local statement_timeout = '10s'`; await sql`set local timezone = 'UTC'`;
    const [state] = await sql`select to_regnamespace('auth') is not null as schema_exists,
      to_regclass('auth.session') is not null as table_exists`;
    if (state!.schema_exists && !state!.table_exists) throw new Error("AUTH_SCHEMA_UNREVIEWED");
    if (!state!.table_exists) return { schema: false, rows: 0, fingerprint: null };
    const [rows] = await sql`select count(*)::int as count,
      encode(sha256(convert_to(coalesce(string_agg(row_to_json(s)::text, '|' order by id), ''), 'UTF8')), 'hex') as fingerprint
      from auth.session s`;
    // A comparison checksum stays in memory. Never print session rows, hashes or identifiers.
    return { schema: true, rows: rows!.count as number, fingerprint: rows!.fingerprint as string };
  });
}
async function fixtureSchema(sql: postgres.TransactionSql) {
  for (const statement of readFileSync('db/migrations/0014_revocable_sessions.sql', 'utf8').split('--> statement-breakpoint'))
    if (statement.trim()) await sql.unsafe(statement);
}

/** Existing auth data is never selected for mutation; pending DDL is rollback-only. */
export async function validateSession(connection: Connection) {
  markValidationStage("revocable_sessions_state_before");
  const rollback = new Error("SESSION_FIXTURE_ROLLBACK"); let checks = 0;
  const before = await sessionState(connection);
  markValidationStage(before.schema ? "revocable_sessions_existing_schema" : "revocable_sessions_rollback_ddl");
  try {
    await connection.begin("isolation level read committed", async (sql) => {
      await sql`set local statement_timeout = '20s'`; await sql`set local lock_timeout = '5s'`;
      if (!before.schema) await fixtureSchema(sql);
      const store = postgresSessionStore(fixtureConnection(sql)), principalId = randomUUID(), other = randomUUID();
      const write = await issueSession({ principalId, permission: 'write', ttlSeconds: 60 }, store);
      const read = await issueSession({ principalId, permission: 'read' }, store);
      const independent = await issueSession({ principalId: other, permission: 'write' }, store);
      assert.equal((await authenticateSession(write.token, store, 'write'))?.principalId, principalId); checks++;
      assert.equal((await authenticateSession(read.token, store))?.permission, 'read'); checks++;
      assert.equal(await authenticateSession(read.token, store, 'write'), null); checks++;
      const [stored] = await sql`select count(*)::int as count, bool_and(length(token_hash) = 64) as hashes from auth.session
        where principal_id in (${principalId}, ${other})`;
      assert.equal(stored!.count, 3); assert.equal(stored!.hashes, true); checks += 2;
      const [raw] = await sql`select exists(select 1 from auth.session
        where principal_id in (${principalId}, ${other}) and token_hash = ${write.token}) as leaked`;
      assert.equal(raw!.leaked, false); checks++;
      await revokeSession(write.token, store); await revokeSession(write.token, store);
      assert.equal(await authenticateSession(write.token, store), null); checks++;
      assert.ok(await authenticateSession(read.token, store)); checks++;
      await revokePrincipalSessions(principalId, store);
      assert.equal(await authenticateSession(read.token, store), null); checks++;
      assert.ok(await authenticateSession(independent.token, store, 'write')); checks++;
      const expiredHash = createHash('sha256').update(randomUUID()).digest('hex');
      await sql`insert into auth.session (id, token_hash, principal_id, permission, created_at, expires_at)
        values (${randomUUID()}, ${expiredHash}, ${principalId}, 'read', clock_timestamp() - interval '2 hours', clock_timestamp() - interval '1 hour')`;
      assert.equal(await store.lookup(expiredHash), null); checks++;
      async function rejected(work: () => Promise<unknown>) {
        let code: unknown;
        try { await sql.savepoint(async () => work()); }
        catch (error) { code = error && typeof error === 'object' && 'code' in error ? error.code : null; }
        assert.equal(code, '23514'); checks++;
      }
      await rejected(() => sql`update auth.session set revoked_at = null where principal_id = ${principalId} and revoked_at is not null`);
      await rejected(() => sql`update auth.session set permission = 'write' where permission = 'read' and principal_id = ${principalId}`);
      await rejected(() => sql`update auth.session set expires_at = clock_timestamp() + interval '99 days' where principal_id = ${principalId}`);
      await rejected(() => sql`insert into auth.session (id, token_hash, principal_id, permission, expires_at)
        values (${randomUUID()}, 'bad', ${principalId}, 'write', clock_timestamp() + interval '1 hour')`);
      assert.ok([38,41].includes((await exportCatalog(sql)).length)); checks++;
      await sql`set constraints all immediate`; throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  const after = await sessionState(connection);
  assert.equal(after.schema, before.schema); checks++;
  assert.deepEqual(after, before); checks++;
  return { checks, schemaMode: before.schema ? "existing_schema" as const : "rollback_ddl" as const };
}

/** Exercise the post-migration branch without committing a migration or a credential. */
export async function validateSessionModes(connection: Connection) {
  const initial = await sessionState(connection), first = await validateSession(connection);
  let checks = first.checks;
  const modes = [first.schemaMode];
  if (!initial.schema) {
    const rollback = new Error("EXISTING_SESSION_SCHEMA_FIXTURE_ROLLBACK");
    try {
      await connection.begin("isolation level read committed", async (sql) => {
        await sql`set local statement_timeout = '20s'`; await sql`set local lock_timeout = '5s'`;
        await fixtureSchema(sql);
        // Simulate a pre-existing session that must survive the nested fixture unchanged.
        await sql`insert into auth.session (id, token_hash, principal_id, permission, expires_at)
          values (${randomUUID()}, ${createHash('sha256').update(randomUUID()).digest('hex')}, ${randomUUID()}, 'read',
            clock_timestamp() + interval '1 hour')`;
        const second = await validateSession(fixtureConnection(sql));
        assert.equal(second.schemaMode, 'existing_schema'); checks += second.checks + 1;
        modes.push(second.schemaMode); throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    assert.deepEqual(await sessionState(connection), initial); checks++;
  }
  return { checks, modes, authStateUnchanged: true, authSchemaAbsent: !initial.schema };
}
