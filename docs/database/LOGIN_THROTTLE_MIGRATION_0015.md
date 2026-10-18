# Migration 0015 application report

Applied 2026-10-12 on explicitly authorized Neon dev through `DIRECT_URL`. See [shared throttle contract](../phase3/LOGIN_THROTTLE.md). No credentials or private records are included here.

`db/migrations/0015_shared_login_throttle.sql` creates `auth.login_throttle`: SHA-256 bucket key, window start, attempts, maximum attempts, and window seconds. Four constraints bound the key and policy/counter values. It adds no source/User data, modifies no existing table, and requires the auth schema already created by applied migration 0014. Drizzle snapshot/journal generation succeeded; TypeScript and 200 synthetic tests pass.

Pre-application preflight confirmed 38 public tables, 15 applied migrations matching the local prefix, and only 0015 pending. Pre-application focused SQL validation passed 21 checks using the exact migration DDL and synthetic buckets; that transaction rolled back, with table creation/state and public aggregate counts unchanged.

The user then explicitly authorized applying 0015. The guarded runner committed one migration atomically with its ledger entry: previous count 15, applied count 1, total count 16. Post-application read-only preflight verified all 16 hash/timestamp entries match the local prefix, no pending migrations, and 38 public tables. The actual-schema focused throttle fixture passed 21 checks with all synthetic mutations rolled back, throttle state preserved, and public aggregate counts unchanged. The fixture's `migration_applied: false` flag describes the validation operation, not the separately committed migration.

An idempotency rerun applied zero migrations and retained the 16-entry ledger. No prior migration was modified, password enrolled, live login activated, notebook backfill performed, or restoration test run. The 200-test synthetic baseline and TypeScript pass from preparation remain valid; no new full SQL-suite pass is claimed. The separate actual-schema session baseline remains 19 checks from migration 0014.
