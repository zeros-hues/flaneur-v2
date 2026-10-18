# Walk storage migration 0016 review

Applied and validated, 2026-10-13. The user explicitly authorized applying 0016 to Neon dev through `DIRECT_URL`. The runner committed exactly one migration, moving the ledger from 16 to 17 entries. Read-only preflight confirms 41 public tables, a matching ledger and no pending migration. Installed-schema Walk validation passed 59 rollback-only checks; export validation passed 14. Fixtures rolled back and aggregate counts stayed unchanged. An idempotency rerun applied zero migrations. The live Walk remains disconnected from the new store; no backfill, real action, private export file or deployment occurred. Restoration remains deferred.

The preceding local verification baseline remains 258 synthetic tests, TypeScript, production build and no-change Drizzle regeneration. Code checks were not rerun for this database-only application. The preparation record below retains the earlier pre-application validation and review rationale.

Canonical migration: [0016_walk_sessions.sql](../../db/migrations/0016_walk_sessions.sql). Drizzle definitions: [walk.ts](../../db/schema/walk.ts). The generated snapshot/journal match the new tables; regeneration reports no schema changes. The earlier proposal now points to the journaled migration. Earlier applied migration files were not edited.

The migration creates `public.walk_session`, `public.walk_stop` and `public.attention_event`, indexes/constraints, and boundary/immutability functions and triggers. It does not backfill or alter existing notebook rows, create a database, change auth tables, or connect the live Walk. Zero-to-three ordered stops freeze after sealing; empty sessions complete and completed sessions cannot refill. Terminal resolution/event history is retained. Deferred checks reject inconsistent commits; owner/local-day uniqueness and timezone locking prevent extra sessions from context/timezone edits.

Export compatibility is prepared. The exact existing 38-table catalog produces version 2/schema tag `0013`; the exact complete 41-table catalog produces version 3/schema tag `0016`. All three Walk tables and archived/completed history are exported with PostgreSQL textual cells. Partial Walk families and unreviewed Walk columns/types/nullability/keys fail. Download filenames and Settings support v2/v3. Auth tables remain excluded; the explicit 4 MiB delivery limit remains. Older deployed export code that only accepts 38 tables will reject the new catalog, so the updated exporter must accompany use of the migrated database. No deployment was verified or performed.

Validation:

- All 258 synthetic tests, TypeScript and production build pass. New export cases cover v3, incomplete/malformed Walk schemas and owner-protected attachment filenames.
- Drizzle regeneration reports no schema changes.
- `--walk-sessions-only` passes 59 focused checks through `DIRECT_URL`, executing the exact journaled migration using the administrative runner's statement breakpoints. Tests cover frozen membership/completion, retry/owner scope, timezone/previous-day checks, stored feedback, archive withdrawal and boundary triggers. Export preserves Unicode/whitespace context, JSON support references and exact matching event/resolution timestamps. DDL/fixtures roll back, aggregate counts stay unchanged and no private export file is created.
- `--export-only` passes 14 rollback-only checks of the current 38-table schema.
- Read-only preflight confirms 16 matching applied ledger entries, 38 public tables and only `0016_walk_sessions` pending.

No permanent migration, real action, backfill or deployment occurred. Separate-connection contention and live visibility/current-evidence/browser tests remain pending. Restoration remains deferred.

After approval, apply through the administrative runner using `DIRECT_URL`; rerun read-only preflight, focused Walk/export SQL checks and an idempotency migration rerun. Expected state is 17 matching ledger entries, no pending migration and 41 public tables. The validator supports both rollback-only DDL and installed-schema fixtures. Live Walk remains legacy until the session-backed route/UI cutover is implemented and verified.
