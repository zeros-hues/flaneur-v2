# Recovery gate before backfill

Current update, 2026-10-12: explicitly authorized migration 0015 is applied on Neon dev and adds `auth.login_throttle` alongside `auth.session`. Operational database backups must include both auth tables; notebook export excludes the auth schema. Rollback-only throttle validation passed 21 checks, with no fixture changes retained. Restoration verification remains deferred. See [0015 report](../database/LOGIN_THROTTLE_MIGRATION_0015.md).

Status: verification explicitly deferred by the user. Backup and isolated restoration have not been executed. The user later authorized migrations 0006–0013 and SQL write tests on Neon dev through `DIRECT_URL`; see [dev validation](../database/NEON_DEV_VALIDATION.md). This did not authorize a restoration, application backfill, or production cutover. The app export is incomplete and must not be called a database backup. Neither destructive `reparse` nor enrichment replay is a recovery tool.

## Required setup

Migration 0014 is now applied on explicitly authorized Neon dev and creates separate `auth.session` storage. Operational backups of this target must include the `auth` schema as sensitive session state; notebook export deliberately excludes it. Actual-schema session validation used rolled-back fixtures. No restoration verification was performed. See [migration report](../database/SESSION_MIGRATION_0014.md).

Update, 2026-10-12: a read-only versioned application-data export builder is prepared and validated with synthetic records; see [export format](../export/MEMORY_EXPORT_V2.md). The live download route still uses the incomplete legacy export. The new format does not include DDL, sequences, grants, or the migration ledger and has no verified importer/restore path. It does not satisfy or reinstate the deferred restoration test. No private corpus export file or restore database was created.

Use PostgreSQL client tools compatible with server 18 and an empty, disposable database with pgvector support. Keep the source read-only and supply the restore target locally as `PHASE0_RESTORE_DATABASE_URL`. Verify that source and target resolve to different database instances/databases. Never log either URL or paste credentials into documentation.

Store the dump outside version control in a private directory with access restricted to the operator. A dump contains private source text and notes. Record a SHA-256 checksum, UTC capture time, client/server versions, migration hashes, and aggregate counts. Preserve the encrypted/private copy through cutover.

## Backup and verification

1. Use `pg_dump` custom format to capture the whole application database, including `public` and the Drizzle migration schema. Keep source privileges read-only. Record any extensions, ownership/grants, role dependencies, or managed-provider objects requiring separate setup.
2. Inspect the archive with `pg_restore --list`. Confirm snapshots, bytea contents, notes, source associations, indexes, constraints, sequences, and migration ledger are represented. A listing alone is not restore verification.
3. Restore only into the verified disposable target. Apply provider-appropriate ownership/ACL options deliberately; do not run `--clean` against the configured app database.
4. Run aggregate/schema inspection against the restored target by overriding the inspection process's `DATABASE_URL`. Compare all table counts, migration hashes, extension versions, constraints/indexes, and deterministic primary-key sets with the source baseline.
5. Compare per-table content checksums under a deterministic row ordering, including snapshot bytes and user text. Validate gzip for every restored snapshot, preserving malformed originals and reporting exceptions rather than dropping them.
6. Verify private access and representative source/note reads on the isolated app, with providers disabled. Confirm restored references resolve. Record commands with credentials redacted, timings, checksums, exceptions, and the restore report.

## Release and rollback

The original plan required verified restoration before backfill. The user has deferred that verification for now; this does not authorize executing a backfill. Authorized dev migrations and rollback-only SQL validation are recorded separately; broader operational recovery and capture continuity remain release work under the user's then-current instructions.

Rollback normally disables new readers while preserving new captures. Restoring an old database over newer user data would lose records; it requires a separate recovery decision and reconciliation of post-backup writes. Destructive cleanup is a later, separately reviewed action.
