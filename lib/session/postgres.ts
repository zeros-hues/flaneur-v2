import type postgres from "postgres";
import { databaseTimestamp } from "../database-timestamp";
import type { SessionStore } from "./service";

/** Supplied pool only. Does not load credentials, issue login endpoints, or log tokens. */
export function postgresSessionStore(connection: ReturnType<typeof postgres>): SessionStore {
  async function write<T>(work: (sql: postgres.TransactionSql) => Promise<T>) {
    const output = await connection.begin("isolation level read committed", async (sql) => {
      await sql`set local statement_timeout = '10s'`; await sql`set local lock_timeout = '3s'`;
      return { result: await work(sql) };
    });
    return output.result;
  }
  return {
    create: (record) => write(async (sql) => {
      const [row] = await sql`with session_clock as (select clock_timestamp() as now)
        insert into auth.session (id, token_hash, principal_id, permission, created_at, expires_at)
        select ${record.id}, ${record.tokenHash}, ${record.principalId}, ${record.permission}, now,
          now + (${record.ttlSeconds} * interval '1 second') from session_clock returning expires_at`;
      return { expiresAt: databaseTimestamp(row!.expires_at).toISOString() };
    }),
    async lookup(tokenHash) {
      const output = await connection.begin("isolation level read committed read only", async (sql) => {
        await sql`set local statement_timeout = '10s'`;
        const rows = await sql`select principal_id, permission from auth.session
          where token_hash = ${tokenHash} and revoked_at is null and expires_at > clock_timestamp()`;
        const row = rows[0];
        return { grant: row ? { principalId: row.principal_id as string, permission: row.permission as "read" | "write" } : null };
      });
      return output.grant;
    },
    revoke: (hash) => write(async (sql) => {
      await sql`update auth.session set revoked_at = clock_timestamp() where token_hash = ${hash} and revoked_at is null`;
    }),
    revokeAll: (principal) => write(async (sql) => {
      await sql`update auth.session set revoked_at = clock_timestamp() where principal_id = ${principal} and revoked_at is null`;
    }),
  };
}
