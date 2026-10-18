# Migration 0017: source-neutral Person creation

Applied to Neon dev on 2026-10-18 after the user's explicit approval. The administrative runner used `DIRECT_URL` and committed exactly one migration, moving the ledger from 17 to 18 entries. Read-only preflight confirms 18 matching applied entries, 41 public tables and no pending migration. No Person was created by the migration, and capture-v2 remains disabled. Backup restoration verification remains deferred at the user's request.

Installed-schema validation passes 40 Person-creation assertions, 63 identity regressions and 14 export checks through `DIRECT_URL`. All synthetic data and job changes rolled back; aggregate and additional source/link/request counts remained unchanged. The creation fixture reports `schema_mode: installed` and performs no proposed DDL. Its count is two lower than the earlier 42-check proposal because the old-schema readiness rejection cases are skipped after installation. An idempotency rerun applied zero migrations. No real Person, identity decision, capture/job, private export file, provider request, backfill or deployment occurred.

This was a database application/verification step. The prior 324-test, TypeScript, production build, 26-browser-check and 25-HTTP-check results remain the preparation baseline; they were not rerun for the database-only application. The full SQL suite and deployed authenticated creation were not exercised.

The sections below retain the preparation rationale and validation record; the migration is now installed on the authorized dev target.

Canonical migration: [0017_source_neutral_people.sql](../../db/migrations/0017_source_neutral_people.sql). Schema definition: [people.ts](../../db/schema/people.ts). Generated snapshot/journal are checked in the workspace; regeneration reports no additional schema changes. Earlier migration files were not edited.

## Exact change

```sql
ALTER TABLE "person" ALTER COLUMN "profile_url" DROP NOT NULL;
```

This makes the legacy profile URL projection optional. The Person UUID remains the primary key. The existing unique index still protects duplicate non-null legacy URLs, while new reviewed people can each have a null URL. There are no new tables, auth changes, row rewrites, data updates, source-key assignments or backfill in this migration. Existing Person URLs and names remain unchanged.

The change removes the need to treat a captured URL as the new Person's canonical identity. The prepared flow stores source identity on the existing Artifact/Snapshot/Encounter records and stores the owner's explicit Person association as an immutable User proof and Encounter link. It does not reuse a legacy Person merely because its URL or name matches.

## Prepared application behavior

See [Person creation](../phase3/PERSON_CREATION.md). Before 0017, the read-only catalog readiness check disables creation in the UI and the service rejects direct creation requests with `person_creation_not_ready`. Existing-person confirmation remains available. After the nullable schema is installed, the prepared code permits creation for an active supported unresolved capture following explicit owner review. Applying the migration itself creates no Person and processes no job. Capture-v2 stays disabled.

Nullable URL consumers have been checked: Person source links already use the safe nullable URL helper, read models infer the nullable schema type, and legacy search-hit types now allow null. New people leave legacy profile enrichment fields empty. Their name is entered by the owner; identity-versioned extraction can subsequently create supported facts through the existing worker.

Exports retain the self-describing v3 PostgreSQL text-cell format. A nullable Person URL catalog selects schema tag `0017`; the installed 0016 schema continues selecting `0016`. Null URL cells and exact Unicode names are preserved. No importer/restoration implementation is claimed. Updated nullable-aware application code should accompany use of new null-URL records; older binaries may assume a required URL.

## Validation

- All 324 synthetic tests, application TypeScript and the production build/package pass. The new cases cover creation/retry atomicity, stale and changed requests, unsupported/inactive captures, schema readiness, input boundaries, queue failure and null-URL export metadata.
- `node scripts/database/validate.mjs --person-creation-only` passes 42 Neon dev assertions through `DIRECT_URL`, executing the exact proposed SQL inside a transaction that rolls back. Checks exercise real creation/proof/link/queue writes, trusted server receipt time, supported fact extraction, independent same-name people with null URLs, preservation of a same-URL legacy Person and its unique index, request conflicts/replays, queue-failure rollback, rejection/archive behavior and export fidelity. The post-rollback nullability and aggregate/extra table counts match their original state. No migration ledger row is written.
- Existing identity review passes 63 rollback-only regression assertions; the unchanged installed-schema export path passes 14. All fixtures roll back and counts remain unchanged. No private export file was created.
- Real review components pass 26 headless Chromium checks with synthetic APIs, including explicit creation/cancellation, stable retries after a lost acknowledgement and disabled creation without schema readiness. The production app passes 25 isolated HTTP checks with synthetic private settings and an unreachable fixture database, including denial of unsigned creation writes. No real owner login is used.
- Drizzle regeneration reports no schema changes after generating 0017. Read-only administrative preflight confirms 17 matching applied ledger entries, 41 public tables and only `0017_source_neutral_people` pending.

The initial proposed-DDL fixture tried to alter the Person table after synthetic inserts had queued deferred registry checks. PostgreSQL rejected that test order with `55006`; the fixture now performs proposed DDL before inserts. The completed validation passes and leaves the installed constraint unchanged. A separate HTTP fixture expectation was corrected to respect the writer's existing authentication-before-origin order; production authorization was not changed.

## Application after approval

1. Run read-only preflight and verify a matching 17-entry applied prefix with only `0017_source_neutral_people` pending.
2. Apply using the existing administrative migration runner and `DIRECT_URL`. Expected result: one applied migration, 18 matching ledger entries, still 41 public tables and no pending migration.
3. Repeat read-only preflight and run the Person-creation fixture in installed-schema mode, identity/export regressions and an idempotent migration rerun.

The ALTER requires a Person table lock; the existing administrative runner has bounded lock and statement timeouts. After real null-URL people exist, reverting to `NOT NULL` requires a separately reviewed data/model decision. Do not invent URLs, delete people or silently rewrite identities to force a downgrade. The forward migration does not require backup restoration verification to be resumed.

Preparation performed no permanent schema/data change, real creation/job, credentials change, provider request, historical reconciliation or deployment. The separately approved schema application is recorded above.
