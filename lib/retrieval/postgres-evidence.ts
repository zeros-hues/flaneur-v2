import type postgres from "postgres";
import type { EvidenceStore } from "./persistence";

// Prepared only. No credentials, pool, runnable command, or live-route imports.
export function postgresEvidenceStore(connection: ReturnType<typeof postgres>): EvidenceStore {
  return { async transaction(snapshotId, version, work) {
    const result = await connection.begin("isolation level read committed", async (sql) => ({
      output: await evidenceStoreInTransaction(sql).transaction(snapshotId, version, work),
    }));
    return result.output;
  } };
}

/** Caller owns commit/rollback. Used inside the job's fenced completion, never nested transactions. */
export function evidenceStoreInTransaction(sql: postgres.TransactionSql): EvidenceStore {
  return { async transaction(snapshotId, version, work) {
      await sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["representation", snapshotId, version])}, 0))`;
      const output = await work({
        async findRepresentation(id, normalizerVersion) {
          const rows = await sql`select id, snapshot_id, normalizer_version, text, text_hash
            from public.snapshot_representation where snapshot_id = ${id} and normalizer_version = ${normalizerVersion}`;
          const row = rows[0];
          return row ? { id: row.id, snapshotId: row.snapshot_id, normalizerVersion: row.normalizer_version,
            text: row.text, textHash: row.text_hash } : null;
        },
        async insertRepresentation(value) {
          await sql`insert into public.snapshot_representation (id, snapshot_id, normalizer_version, text, text_hash)
            values (${value.id}, ${value.snapshotId}, ${value.normalizerVersion}, ${value.text}, ${value.textHash})`;
        },
        async findSupport(id) {
          // Serializes retries involving the same evidence ID even across normalizer versions.
          const rows = await sql`select id, snapshot_id, excerpt from public.observation_evidence where id = ${id} for update`;
          const row = rows[0];
          return row ? { id: row.id, snapshotId: row.snapshot_id, excerpt: row.excerpt } : null;
        },
        async findLocator(id) {
          const rows = await sql`select evidence_id, representation_id, start_codepoint, end_codepoint, quote
            from public.text_evidence where evidence_id = ${id}`;
          const row = rows[0];
          return row ? { evidenceId: row.evidence_id, representationId: row.representation_id,
            start: row.start_codepoint, end: row.end_codepoint, quote: row.quote } : null;
        },
        async insertLocator(value) {
          await sql`insert into public.text_evidence (evidence_id, representation_id, start_codepoint, end_codepoint, quote)
            values (${value.evidenceId}, ${value.representationId}, ${value.start}, ${value.end}, ${value.quote})`;
        },
      });
    return output;
  } };
}
