# Session migration 0014, applied on Neon dev

Date: 2026-10-12. The user explicitly authorized applying `0014_revocable_sessions` to Neon dev through `DIRECT_URL`. No credentials, endpoints, private records, or session tokens are included in this report. Live login, review, and export routes remain unchanged.

Read-only preflight verified the 14-entry applied migration prefix and one pending migration, 0014. The first migration connection timed out before migration execution. Retrying the same authorized action committed one migration, taking the ledger from 14 to 15 entries. The guarded runner applied schema/table/index/function/trigger statements and the ledger entry in one transaction with advisory locking, timeouts, exact prefix verification, and deferred constraint validation.

Migration 0014 creates `auth.session`, hash/grant/expiry checks, a principal index, and immutable session identity/terminal-revocation guards. Authentication state is separate from the 38 public notebook tables. Applied SQL was not edited afterward.

Post-migration read-only preflight verified 15 matching ledger entries, no pending migrations, and 38 public tables. The new auth table is outside public. A migration rerun verified idempotency: previous count 15, applied count zero, total count 15.

Focused SQL validation against the actual applied schema passed 19 checks with `node scripts/database/validate.mjs --sessions-only`. It exercised the existing-schema path, owner read/write permissions, hash-only storage, per-device/all-device revocation, expiry, immutable grants/expiry, terminal revocation, malformed hashes, public export exclusion, and preservation of session state/notebook counts. Synthetic rows and updates were rolled back. The schema remained present, as expected after migration. The validator's `migration_applied: false` flag means validation itself applies no migration; the separate migration runner already committed 0014.

The preceding 39-check run exercised absent and simulated existing schemas before application. The earlier 211-check complete SQL suite remains a separate baseline; no new full-suite pass is claimed. The synthetic baseline remains 189 passing tests, with TypeScript and schema-drift checks passing from preparation. No application code changed in this migration step.

No real password/hash was configured, login session issued, private export built, provider invoked, backfill run, or live route activated. Password enrollment, server-only configuration, deployed login throttling, browser/UI verification, and route integration remain pending. Restoration verification remains deferred. Operational backups must now include the sensitive `auth` schema; notebook export deliberately excludes it.
