# Phase 1: schema applied on Neon dev; backfill pending

Current update, 2026-10-12: new Person notes append immutable User observations; revisions preserve original text through the correction service. Exact text and retry IDs are retained. Legacy in-place PATCH is retired, and earlier notes remain preserved/read-only until reviewed backfill. All 233 synthetic tests, TypeScript, production build and 17 rollback-only authoring SQL checks pass; built-note rejection smoke passed five HTTP assertions. No real note, schema migration, bulk backfill or deployment occurred. V2 recall/resurfacing cutover and browser verification remain pending. See [immutable authoring](../phase3/IMMUTABLE_NOTES.md). Earlier entries retain history.

Current update, 2026-10-12: Person archive controls now preserve inspectable history and suppress archived/aliased Persons from active legacy readers. Notes and Walk writes enforce registry locks. ORM/direct SQL pools are separated to protect timestamp/JSON codecs; restart application processes. All 228 synthetic tests, TypeScript, production build and 119 rollback-only compatibility SQL checks pass. The final built app passed 12 HTTP smoke assertions. No real Person archival, migration, backfill or deployment occurred; browser verification and remaining reader/capture migration stay pending. See [archival integration](../phase3/PERSON_ARCHIVE_UI.md). Earlier entries retain their history.

Current update, 2026-10-12: the Person page now has dedicated captured-profile identity inspection and explicit confirm/reject controls. Conflicting associations are not automatically resolved, and unsupported/archived captures cannot be confirmed. All 226 synthetic tests, TypeScript, production build, 20 rollback-only identity inspection/decision SQL checks, and 10 built-identity HTTP checks pass. No real identity decision, schema migration, backfill or deployment occurred; interactive browser verification and broader Person/capture migration remain pending. See [identity integration](../phase3/IDENTITY_INSPECTION.md). Earlier entries retain their history.

Current update, 2026-10-12: the Person page now has stored observation/evidence inspection and explicit confirm/correct/reject/archive controls under owner sessions. Historical text/truth layers and decision history are retained; identity proofs require separate review. Person metadata is now protected before name lookup. All 221 synthetic tests, TypeScript, production build, 15 rollback-only inspection SQL checks, and 11 built-inspection HTTP checks pass. No new migration, backfill, real review or deployment occurred; interactive browser verification and further Person-page migration remain pending. See [inspection integration](../phase3/OBSERVATION_INSPECTION.md). Older entries retain preparation history.

Current update, 2026-10-12: the local review route connects all seven prepared review/archive services to owner-session write authorization and exact HTTPS Origin checks. All 217 synthetic tests, TypeScript, production build, 131 rollback-only Neon review SQL checks, and 10 built-route HTTP rejection checks pass. No real review, new migration, backfill, or deployment was performed; inspection/review UI and HTTPS browser verification remain pending. See [review integration](../phase3/REVIEW_ROUTE.md). Earlier entries retain their history.

Current update, 2026-10-12: the local export route now serves the reviewed v2 notebook format under owner-session authorization. The partial legacy exporter was removed; Settings reports download failures. Buffered delivery enforces a 4 MiB cap with explicit failure rather than partial output. All 214 synthetic tests, TypeScript, production build, 14 rollback-only export SQL checks, and 13 built-route HTTP rejection checks pass. No migration, private export file, or Vercel deployment was created; restoration remains deferred. See [export integration](../export/MEMORY_EXPORT_V2.md). Earlier entries retain their history.

Current update, 2026-10-12: owner-password configuration passes the private readiness check. Dashboard login/logout, page authentication, and async API guards now use revocable owner sessions in the local codebase; extension capture keeps its separate credential. All 212 synthetic tests, TypeScript, the production build, and 22 built-app HTTP smoke assertions pass. No Vercel deployment or database mutation was performed; HTTPS browser login/cookie verification remains pending. The ledger remains 16 applied entries. See [dashboard integration](../phase3/DASHBOARD_AUTH.md). Earlier statements below retain preparation history.

Current update, 2026-10-12: owner-session server composition and private auth:status checks are prepared. All 207 synthetic tests and TypeScript pass. The selected HTTPS origin is saved locally and passes the private readiness check; owner-password configuration remains unready and the runtime database URL is configured. Live login remains disconnected, no database or Vercel deployment was changed, and the ledger remains 16 applied entries. See [server integration contract](../phase3/OWNER_RUNTIME.md). Older entries below retain historical counts/state.

Current update, 2026-10-12: migration 0015_shared_login_throttle was explicitly authorized and committed on Neon dev through DIRECT_URL. The ledger has 16 matching applied entries and no pending migrations; actual-schema throttle validation passed 21 rollback-only checks with state/counts unchanged, and an idempotency rerun applied zero migrations. The preparation baseline remains 200 synthetic tests and TypeScript passing. Password enrollment is unconfirmed and live login remains disconnected. See [throttle contract](../phase3/LOGIN_THROTTLE.md). Earlier updates below retain their historical counts and migration state.

Update, 2026-10-12: migration 0014 was explicitly authorized and committed on Neon dev through DIRECT_URL. The ledger now has 15 matching entries and no pending migrations. Actual-schema session validation passed 19 checks with fixtures rolled back and state unchanged; an idempotency rerun applied zero migrations. The preceding 211-check complete SQL baseline and 39-check pre-application session run remain separate. The synthetic baseline is 196 passing tests with TypeScript/schema-drift checks passing. Live login/routes, password enrollment, throttling, backfill, and restoration verification remain pending. See [session migration report](../database/SESSION_MIGRATION_0014.md).

The sections below retain the earlier local preparation record, before this dev authorization. Claims that SQL was unapplied or unexecuted refer to that earlier state; the dev validation report identifies the exact paths now exercised. New capture writers and v2 readers remain disabled; the backfill writer has no application route, CLI, environment loading, or connection creation.

## Implemented

- Domain schemas: references, encounters, observations, evidence, source identities, aliases, reviews, structured role/education/skill support, relationships/support, and migration receipts.
- Migrations 0006–0010: foundation and subtype/cycle/revision guards; source-neutral Artifact types and publication precision; optional legacy author projections with restrictive deletion; typed relationship endpoints, supported activation, structured owner/field checks, and unique logical edges. Hand-authored SQL guards are outside Drizzle snapshots and must be retained in review.
- Deterministic planner: original note IDs/text, separate encounters per snapshot, profile artifacts, uncertain structured facts, attributed legacy inference, candidate relationships, and last-known scheduling assertions.
- Injectable transactional backfill writer: receipts commit with their rows; retries skip matching fingerprints; changed input or conflicting target rows fail. Independent assertions support one logical relationship. Unresolved user data prevents an incomplete write manifest.
- Read-only reconciliation and authoritative co-occurrence functions. Counts derive from distinct active Artifact–Concept links, never capture/assertion counts. Existing aggregates have not been overwritten.
- Source identity candidates with collision reporting. Candidates are not automatically promoted and historical entities are not merged.
- Compatibility guards keep new profile/source artifacts out of legacy post-answer retrieval and the due-item Walk.

Applying migrations would write registry rows and alter constraints. Calling the injectable writer would write data. Neither action is authorized or has occurred.

## Final read-only dry run

2026-10-11, one guarded repeatable-read transaction, planner version 2:

| Planned output | Count |
| --- | ---: |
| Object references, including planned new entities | 1,141 |
| Capture encounters | 36 |
| Encounter/object links | 72 |
| User observations | 36 |
| Legacy inference observations | 255 |
| Unverified structured facts | 540 |
| Structured support links, including role inference | 729 |
| Candidate logical relationships | 141 |
| Profile-page artifacts | 12 |
| Profile snapshot mappings | 13 |
| Prepared transactional batches | 1,125 |
| Prepared target rows | 2,077 |
| Source identity candidates requiring evidence review | 39 |
| Conflicting source identity keys | 1 |
| Unresolved notes / unmapped profile captures | 0 / 0 |

Two plans were identical. Fingerprint: `63b66815fbc6b868ab08ccb0267dd541d8fdb072792fd6194a77c5f23b063688`. This is a proposed-plan fingerprint, not a backup or proof of database execution.

## Historical limits

Profiles group by existing person assignment and exact captured URL. Meaningful URL variants remain separate; unresolved people are not merged by URL alone. Reused legacy person assignment remains unverified, and its profile-of relationship is a candidate. Original snapshots and legacy links stay unchanged; v2 access follows encounter source links and deterministic artifact migration keys.

Current note bodies import as User notes rather than automatically becoming reasons for noticing. Original note creation time is retained as metadata; it does not establish when an edited body was written. Eventual import time becomes observation recorded time. Missing original wording, field excerpts, inferred input sets, publication dates, action times, and contact confirmation remain unknown.

All historical relationships stay candidates until support is validated. Legacy hashtags retain source attribution but unavailable original terms remain unknown. The identity conflict does not authorize a merge. School slug/name alone does not establish an Organisation identity; education retains original values until supported resolution.

## Verification

- 22 synthetic tests pass, including identity/history, uncertainty, batch interruption/retry/conflicts, reconciliation, logical edges, and co-occurrence.
- Application and extension TypeScript checks pass with incremental writes disabled.
- Production build passes, including extension packaging and Next.js compilation.
- Live dry runs used read-only transactions and emitted only aggregates/fingerprints. No providers or mutation scripts were called.

The PostgreSQL adapter and PL/pgSQL guards are typechecked/reviewed but **not executed against a database**. Synthetic transaction tests validate the batching contract, not PostgreSQL constraint timing, concurrency, or legacy writer compatibility. This is not a verified migration release.

## Safe commands

`node --test scripts/phase1/plan.test.mjs scripts/phase1/continuation.test.mjs`

`node scripts/phase1/dry-run.mjs`

Administrative migration/SQL validation is now authorized on the configured Neon dev target through `DIRECT_URL`; use the guarded commands in the dev validation report. Backfill, reparse, and reenrich were not included. Resume the same reviewed manifest when backfill is authorized. If source notes/facts change, reconcile and explicitly version the affected import; do not bypass fingerprint conflicts or mutate retained observations.

## Pending before database activation

Verify SQL application, deferred constraints, concurrency, writer compatibility, and post-backfill reconciliation when database testing is authorized. Review conflicting identities and recoverable evidence before activating relationships. Prepare continuity for arriving captures; this batch writer is not a dual-write capture implementation. Extend source-neutral Person identity before enabling non-LinkedIn person adapters.

Phase 1 local code is substantially prepared; database execution and the release gate remain open. Restoration verification is deferred by user instruction and does not block further local work. Durable new capture and extraction are Phase 2.
