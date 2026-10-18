import type postgres from "postgres";
import { databaseTimestamp } from "../database-timestamp";
import type { PersonArchiveStore } from "./person-archive";
import { withDependencyTransaction, invalidateDependencies } from "../processing/postgres-dependencies";

/** Prepared supplied-connection store; no live route, credentials or background loop. */
export function postgresPersonArchiveStore(connection: ReturnType<typeof postgres>): PersonArchiveStore {
  return { async transaction(personId, work) {
    return withDependencyTransaction(connection, async (sql) => {
      const rows = await sql`select id from public.observation where subject_id = ${personId}`;
      return rows.map((row) => row.id as string);
    }, async (sql) => {
      const rows = await sql`select distinct s.id from public.snapshot s where exists (
        select 1 from public.observation o where o.subject_id = ${personId}
          and o.structured_value->>'identity_for_snapshot' = s.id::text)
        or exists (select 1 from public.observation_derivation d join public.observation o on o.id = d.observation_id
          where d.snapshot_id = s.id and o.subject_id = ${personId})`;
      if (rows.length > 5000) throw new Error("ARCHIVE_PARSE_SCOPE_LIMIT");
      return [`enrich:object:${personId}`, `index:object:${personId}`, ...rows.map((row) => `parse:snapshot:${row.id}`)];
    }, async (sql, context) => work({
      async receipt(key) {
        const rows = await sql`select fingerprint, committed_at from public.migration_receipt where key = ${key}`;
        const row = rows[0];
        return row ? { fingerprint: row.fingerprint, archivedAt: databaseTimestamp(row.committed_at).toISOString() } : null;
      },
      async available(id) {
        const rows = await sql`select id from public.object_ref r where id = ${id} and kind = 'person' and archived_at is null
          and not exists (select 1 from public.object_alias a where a.former_object_id = r.id) for update of r`;
        return rows.length === 1;
      },
      async archive(id) {
        const rows = await sql`update public.object_ref set archived_at = transaction_timestamp()
          where id = ${id} and kind = 'person' and archived_at is null returning archived_at`;
        if (rows.length !== 1) throw new Error("ARCHIVE_PERSON_UNAVAILABLE");
        return databaseTimestamp(rows[0]!.archived_at).toISOString();
      },
      async invalidate(decisionId) {
        await invalidateDependencies(sql, context, decisionId, { invalidateParse: true });
        await sql`update public.relationship set state = 'candidate' where state = 'active'
          and (from_object_id = ${personId} or to_object_id = ${personId})`;
      },
      async insertReceipt(request) {
        await sql`insert into public.migration_receipt (key, fingerprint) values (${request.key}, ${request.fingerprint})`;
      },
    }));
  } };
}
