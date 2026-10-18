import type postgres from "postgres";
import { databaseTimestamp } from "../database-timestamp";
import type { ArchiveStore } from "./archive";
import { withDependencyTransaction, invalidateDependencies } from "../processing/postgres-dependencies";

/** Prepared only. A supplied connection and explicit authenticated caller are required. */
export function postgresArchiveStore(connection: ReturnType<typeof postgres>): ArchiveStore {
  return { async transaction(observationId, work) {
    return withDependencyTransaction(connection, async () => [observationId], [], async (sql, context) => work({
      async receipt(key) {
        const rows = await sql`select fingerprint, committed_at from public.migration_receipt where key = ${key}`;
        const row = rows[0];
        return row ? { fingerprint: row.fingerprint, archivedAt: databaseTimestamp(row.committed_at).toISOString() } : null;
      },
      async observation(id) {
        const node = context.nodes.find((item) => item.id === id);
        return node ? { active: !context.inactive.has(id), identityProof: node.identityProof,relationshipReview:node.relationshipReview } : null;
      },
      async archive(id) {
        const rows = await sql`update public.object_ref set archived_at = transaction_timestamp()
          where id = ${id} and kind = 'observation' and archived_at is null returning archived_at`;
        if (rows.length !== 1) throw new Error("ARCHIVE_OBSERVATION_UNAVAILABLE");
        return databaseTimestamp(rows[0]!.archived_at).toISOString();
      },
      async invalidate(decisionId) { await invalidateDependencies(sql, context, decisionId); },
      async insertReceipt(request) {
        // Existing operation receipts keep retries stable without changing an applied migration.
        await sql`insert into public.migration_receipt (key, fingerprint) values (${request.key}, ${request.fingerprint})`;
      },
    }));
  } };
}
