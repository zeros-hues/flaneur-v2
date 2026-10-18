import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import postgres from "postgres";
import { databaseUrl, safeFailure } from "./environment.mjs";

// Read-only, aggregate-only inspection. No application imports or model calls.
const tables = ["person", "organisation", "role", "education", "skill", "headline_history",
  "section_coverage", "artifact", "note", "snapshot", "schedule", "concept",
  "concept_link", "concept_edge", "quarantine", "parser_health", "saved_query"];
let client;
try {
  client = postgres(databaseUrl(), { max: 1, connect_timeout: 10, idle_timeout: 5, onnotice: () => {} });
  const report = await client.begin("isolation level repeatable read read only", async (tx) => {
    await tx`set local statement_timeout = '15s'`;
    const [transaction] = await tx`select current_setting('transaction_read_only') as read_only,
      current_setting('transaction_isolation') as isolation,
      current_setting('server_version') as server_version`;
    if (transaction.read_only !== "on") throw Object.assign(new Error("Read-only guard failed"), { code: "READ_ONLY_GUARD" });
    const extensions = await tx`select extname, extversion from pg_extension order by extname`;
    const columns = await tx`select c.relname as table_name, a.attname as column_name,
      format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as not_null
      from pg_attribute a join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
      order by c.relname, a.attnum`;
    const constraints = await tx`select c.relname as table_name, k.conname as name,
      k.contype as type, k.convalidated as validated, pg_get_constraintdef(k.oid) as definition
      from pg_constraint k join pg_class c on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
      order by c.relname, k.conname`;
    const enums = await tx`select t.typname as name, e.enumlabel as value
      from pg_type t join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public'
      order by t.typname, e.enumsortorder`;
    const indexes = await tx`select tablename, indexname, indexdef from pg_indexes
      where schemaname = 'public' order by tablename, indexname`;
    const present = new Set(columns.map((c) => c.table_name));
    const counts = {};
    for (const table of tables.filter((t) => present.has(t))) {
      const [row] = await tx`select count(*)::int as count from ${tx(`public.${table}`)}`;
      counts[table] = row.count;
    }
    const journal = JSON.parse(readFileSync("db/migrations/meta/_journal.json", "utf8"));
    const expectedMigrations = journal.entries.map((entry) => ({
      tag: entry.tag, timestamp: entry.when,
      hash: createHash("sha256").update(readFileSync(`db/migrations/${entry.tag}.sql`, "utf8")).digest("hex"),
    }));
    const [migrationTable] = await tx`select to_regclass('drizzle.__drizzle_migrations') is not null as present`;
    const applied = migrationTable.present
      ? await tx`select hash, created_at from drizzle.__drizzle_migrations order by created_at` : [];
    const migrationComparison = expectedMigrations.map((m) => ({
      tag: m.tag, applied_timestamp_match: applied.some((a) => Number(a.created_at) === m.timestamp),
      applied_hash_match: applied.some((a) => a.hash === m.hash && Number(a.created_at) === m.timestamp),
    }));
    const result = { captured_at: new Date().toISOString(), transaction, extensions, counts,
      missing_tables: tables.filter((t) => !present.has(t)), columns, constraints, enums, indexes,
      migrationComparison, applied_migration_count: applied.length,
      unrecognized_migrations: applied.filter((a) => !expectedMigrations.some((m) => m.hash === a.hash)).length };
    if (result.missing_tables.length) return { ...result, aggregates: "skipped: incomplete schema" };
    result.aggregates = await tx`select
      (select count(*)::int from note where snapshot_id is null) as snapshotless_notes,
      (select count(*)::int from note where person_id is null and artifact_id is null) as unresolved_notes,
      (select count(*)::int from snapshot where person_id is null and artifact_id is null) as unresolved_snapshots,
      (select count(*)::int from snapshot where capture_type = 'profile' and artifact_id is null) as profile_snapshots_without_artifact,
      (select count(*)::int from artifact where urn is null) as artifacts_without_urn,
      (select count(*)::int from artifact where num_nonnulls(person_id, organisation_id) <> 1) as invalid_authorship,
      (select count(*)::int from parser_health where suspect) as suspect_adapters,
      (select count(*)::int from person where profile_embedding is null) as people_without_profile_embedding,
      (select count(*)::int from role where enrichment_prompt_version is null) as unclassified_roles,
      (select count(*)::int from concept_edge where concept_a_id >= concept_b_id or raw_count < 0) as invalid_concept_edges,
      (select count(*)::int from concept c where document_frequency <> (select count(distinct artifact_id) from concept_link l where l.concept_id = c.id)) as concept_frequency_mismatches,
      (select count(*)::int from saved_query q, unnest(q.last_result_person_ids) pid where not exists (select 1 from person p where p.id = pid)) as dangling_saved_query_ids`;
    result.edge_reconciliation = await tx`with authoritative as (
      select l1.concept_id a, l2.concept_id b, count(distinct l1.artifact_id)::int expected
      from concept_link l1 join concept_link l2 on l1.artifact_id = l2.artifact_id and l1.concept_id < l2.concept_id
      join concept c1 on c1.id = l1.concept_id and c1.kind = 'concept'
      join concept c2 on c2.id = l2.concept_id and c2.kind = 'concept' group by l1.concept_id, l2.concept_id)
      select count(*)::int as mismatched_pairs from authoritative a full join concept_edge e
      on a.a = e.concept_a_id and a.b = e.concept_b_id
      left join concept c1 on c1.id = coalesce(a.a, e.concept_a_id)
      left join concept c2 on c2.id = coalesce(a.b, e.concept_b_id)
      where c1.kind = 'concept' and c2.kind = 'concept' and coalesce(a.expected,0) <> coalesce(e.raw_count,0)`;
    result.role_quality = await tx`select
      count(*) filter (where start_precision = 'absent' and start_date is not null)::int as inconsistent_start,
      count(*) filter (where end_precision = 'absent' and end_date is not null)::int as inconsistent_end,
      count(*) filter (where start_date > end_date)::int as reversed_dates,
      count(*) filter (where domain_confidence < 0 or domain_confidence > 1)::int as invalid_confidence
      from role`;
    // Inspect at most three recent captured payloads in memory; never emit their content/identities.
    const samples = await tx`select capture_type, content_gzip, sections_covered,
      person_id is not null as person_linked, artifact_id is not null as artifact_linked
      from snapshot order by captured_at desc, id desc limit 3`;
    result.snapshot_samples = samples.map((sample) => {
      try {
        const bytes = gunzipSync(sample.content_gzip, { maxOutputLength: 20_000_000 });
        return { capture_type: sample.capture_type, gzip_valid: true, bytes: bytes.length,
          sections: sample.sections_covered, person_linked: sample.person_linked, artifact_linked: sample.artifact_linked };
      } catch {
        return { capture_type: sample.capture_type, gzip_valid: false };
      }
    });
    return result;
  });
  if (!process.argv.includes("--schema")) {
    for (const key of ["columns", "constraints", "enums", "indexes"]) delete report[key];
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  safeFailure(error);
  process.exitCode = 1;
} finally {
  await client?.end({ timeout: 2 });
}
