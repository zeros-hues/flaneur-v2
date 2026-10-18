import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { fixtureConnection, type Connection } from "./fixture-connection";
import { postgresIdentityStore } from "../../lib/identity/postgres-confirmation";
import { confirmProfileIdentity } from "../../lib/identity/confirmation";
import { markValidationStage } from "./validation-stage";

/** Two actual sessions; no committed fixtures, graph changes, or credentials in output. */
export async function validateContention(connection: Connection) {
  const rollback = new Error("CONTENTION_FIXTURE_ROLLBACK");
  let checks = 0;
  const snapshotId = randomUUID(), scope = `processing:parse:snapshot:${snapshotId}`;
  async function rollbackTransaction(work: (sql: postgres.TransactionSql) => Promise<void>) {
    try {
      await connection.begin("isolation level read committed", async (sql) => {
        await sql`set local statement_timeout = '5s'`;
        await work(sql); throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
  }
  async function blocked(work: (sql: postgres.TransactionSql) => Promise<unknown>) {
    let code: unknown;
    try { await rollbackTransaction(async (sql) => { await sql`set local lock_timeout = '250ms'`; await work(sql); }); }
    catch (error) { code = error && typeof error === "object" && "code" in error ? error.code : null; }
    assert.equal(code, "55P03"); checks++;
  }
  await rollbackTransaction(async (owner) => {
    markValidationStage("processing_scope_contention");
    await owner`select pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
    // The real confirmation adapter blocks at its processing lock before inspecting missing fixtures.
    await blocked((contender) => confirmProfileIdentity({ requestId: randomUUID(), snapshotId, personId: randomUUID() },
      postgresIdentityStore(fixtureConnection(contender))));
  });
  await rollbackTransaction(async (owner) => {
    markValidationStage("memory_graph_contention");
    await owner`select pg_advisory_xact_lock(1790703955, 1)`;
    // INSERT invokes the actual memory graph trigger, then waits for the other session's graph lock.
    await blocked((contender) => contender`insert into public.observation
      (id, subject_id, truth_layer, semantic_role, body_text, support_status)
      values (${randomUUID()}, ${randomUUID()}, 'user', 'note', 'rollback-only contention fixture', 'verified')`);
  });
  await rollbackTransaction(async (sql) => {
    markValidationStage("contention_lock_release");
    const [locks] = await sql`select pg_try_advisory_xact_lock(hashtextextended(${scope}, 0)) as scope,
      pg_try_advisory_xact_lock(1790703955, 1) as graph`;
    assert.equal(locks!.scope, true); assert.equal(locks!.graph, true); checks += 2;
  });
  return checks;
}
