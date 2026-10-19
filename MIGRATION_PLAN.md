# Flaneur migration plan

Current update, 2026-10-19: Milestone C pattern-support qualification is READY for the scoped correction. Readable role witnesses now qualify domain candidates before independent-Person counting; irrelevant notes cannot corroborate roles. Reflect applies constraint/date qualification and current reviewed Concept proof checks. No schema or stored data changed. See [the exact live results, support, validation and deferred attribution debt](docs/phase3/PATTERN_SUPPORT_QUALIFICATION.md). This does not mark Phase 3 complete.

Current update, 2026-10-19: the approved trajectory slice is complete locally. Immutable Person Observations now distinguish directed owner-reviewed transitions from unconfirmed chronology candidates and A+B co-occurrence. Confirmation, correction, withdrawal/archive, exact Concept resolution, precision-preserving chronology, Person career/Concept composition and Street evidence/history are implemented. All 394 tests, clean TypeScript, production build/package, 246 rollback-only SQL, 161 browser and 106 HTTP checks pass. No migration/permanent database change, provider, capture activation, backfill or deployment occurred. Phase 3 remains incomplete; no subsequent task was started. See [trajectory implementation, limits and EPFL/3D/Pattern readiness](docs/phase3/TRAJECTORY.md). Earlier updates below retain their historical status.

Current update, 2026-10-18: reviewed education (`educated_at` with optional study field) and employment (`employed_by`) now support direct Person Recall and AND combinations with Person Concept associations. Exact Organisation identity, current immutable User support and dedicated review/history protect results; no relationship propagates through an Artifact. All 380 tests, clean TypeScript, production build/package, 170 rollback-only SQL, 134 browser and 96 HTTP checks pass. No migration/permanent database change, provider, activation, backfill or deployment occurred. Phase 3 remains incomplete. See [implementation and limits](docs/phase3/EDUCATION_EMPLOYMENT.md). [Trajectory is a proposal only](docs/phase3/TRAJECTORY_PROPOSAL.md), awaiting approval.

Current update, 2026-10-18: typed reviewed-Concept retrieval now supports direct Person/Artifact associations, AND combinations and Artifact-scoped author/profile combinations. Exact active Concept identity, explicit question mentions and UUID disambiguation protect target selection. Current owner support is revalidated; interpretations remain separate from source mentions/inferred topics and cannot propagate to authors. All 371 tests, clean TypeScript, build/package, 115 rollback-only SQL checks (54 focused plus 61 retrieval regressions), 117 browser and 86 HTTP checks pass. No migration/permanent data change, real query/job, AI provider, activation, backfill or deployment occurred. See [reviewed Concept retrieval](docs/phase3/REVIEWED_CONCEPT_RETRIEVAL.md).

Current update, 2026-10-18: owner-reviewed Person/Artifact Concept associations are implemented locally, with exact reasons, frozen expected meaning, withdrawal/retry history and reverse Concept inspection. Source mentions, hashtags and legacy inferred links remain separate. Renamed/reclassified/inactive targets retire support in panels, generic inspection and ordinary retrieval. All 363 tests, TypeScript, build/package, 131 rollback-only SQL checks (70 focused, 46 typed retrieval, 15 memory), 109 browser and 86 HTTP checks pass. No migration/permanent data change, real decision/job, provider, activation, backfill or deployment occurred. Typed Concept filters and other relationship policies remain open. See [reviewed Concept associations](docs/phase3/REVIEWED_CONCEPT_ASSOCIATIONS.md).

Current update, 2026-10-18: typed Artifact retrieval now supports reviewed authored_by and profile_of constraints. Exact active Person resolution, literal question mentions, explicit UUID disambiguation and clarification guard identity selection. Current managed support is revalidated; rejected, candidate, conflicting and historical links cannot satisfy filters. Cited User relationship context cannot provide missing topical text or transfer Person facts. All 355 tests, TypeScript, build/package, 61 rollback-only SQL checks (46 focused and 15 memory regressions), 85 browser and 67 HTTP checks pass. No permanent database change, migration, real query/job, provider, activation, backfill or deployment occurred. Reverse traversal, further predicates and identity reconciliation remain open. See [typed relationship retrieval](docs/phase3/TYPED_RELATIONSHIP_RETRIEVAL.md).

Current update, 2026-10-18: Person and Artifact pages now provide read-only reviewed-authorship panels. Both directions share the source-review support checks and expose reasons, withdrawal history, co-authors, current-support counts and paged edges without inferring authors or adding a mutation path. All 346 tests, application TypeScript, production build/package, 92 rollback-only authorship/panel SQL checks, 78 browser checks and 67 HTTP checks pass. No permanent database change, migration, real decision/job, provider, backfill, capture activation or deployment occurred. Typed retrieval, other relationship predicates and identity reconciliation remain open. See [authorship panels](docs/phase3/AUTHORSHIP_PANELS.md).

Current update, 2026-10-18: explicit post authorship review is implemented locally. Owners select an existing Person, preserve a reason, and confirm or withdraw an immutable per-capture User assertion. Independent co-authors and repeated-capture support are retained; profile identity never supplies authorship automatically. All 344 tests, application TypeScript, production build/package, 60 focused rollback-only authorship SQL checks, 38 profile relationship regressions, 62 browser checks and 52 isolated HTTP checks pass. No schema/permanent data change, real decision/job, provider, backfill, capture activation or deployment occurred. Direct Person/Artifact author panels, typed retrieval and other relationships remain open. See [reviewed post authorship](docs/phase3/REVIEWED_POST_AUTHORSHIP.md).

Current update, 2026-10-18: reviewed `profile_of` relationships are implemented for future explicit captured-profile identity decisions. Versioned typed edges retain per-capture User proof support, preserve rejected/legacy rows and expose supported/conflicting/historical states through owner-protected Person/Artifact inspection. Different eligible captures naming different people remain unresolved. All 336 tests, application TypeScript, production build/package, 38 focused rollback-only relationship SQL assertions, 45 browser checks and 37 HTTP checks pass. No schema/permanent data change, real decision, backfill, provider, capture activation or deployment occurred. Other relationship types, typed retrieval and duplicate/ambiguous identity reconciliation remain open. See [reviewed profile relationships](docs/phase3/REVIEWED_PROFILE_RELATIONSHIPS.md).

Relationship regression verification also passes 63 identity, 44 reassignment and 40 creation SQL assertions: 185 rollback-only checks in total, with counts unchanged. A disconnected creation fixture's idle lock cleared without terminating a session; a transaction-local idle timeout now protects that fixture and its final rerun passes.

Current update, 2026-10-18: explicit reassignment of a sole current captured-profile identity is implemented locally. Owners select an existing replacement and enter a reason; one transaction retains both decisions, corrects the Encounter's current Person link, invalidates dependencies and queues new extraction. Ambiguous/rejected histories and inactive objects remain blocked. All 331 tests, application TypeScript, production build/package, 147 rollback-only SQL assertions (44 reassignment, 63 identity, 40 creation), 37 browser checks and 28 HTTP checks pass. No real correction/job, schema/permanent data change, provider, activation, backfill or deployment occurred. Reviewed duplicate/ambiguous identity reconciliation and supported typed relationships remain open. See [reviewed reassignment](docs/phase3/IDENTITY_REASSIGNMENT.md).

Database application, 2026-10-18: the user approved migration 0017 and the administrative runner applied exactly that migration to Neon dev through `DIRECT_URL`. Read-only preflight confirms 18 matching applied entries, 41 public tables and no pending migration. The installed schema now satisfies new-Person creation readiness; capture-v2 remains disabled. No real Person, identity decision, job, provider, backfill or deployment was submitted. The preparation updates below retain their earlier state; see [application report](docs/database/PERSON_CREATION_MIGRATION_0017.md).

Application verification: 40 installed-schema creation checks, 63 identity regressions and 14 export checks pass with fixtures rolled back and counts unchanged. The migration runner's idempotency rerun applies zero migrations. No code/build/browser suite was rerun for this database-only step; the prior preparation baseline is retained below. Reviewed reassignment/source reconciliation and supported typed relationships remain next product gaps.

Current update, 2026-10-18: creating a Person from a reviewed unresolved profile is prepared, with explicit name entry, immutable User proof and atomic Person/Encounter/parse writes. New people use UUID identity and no legacy profile URL. Migration 0017 only makes `person.profile_url` nullable; it is not applied, and UI/service creation remains gated on installed schema readiness. All 324 tests, application TypeScript, build/package, 42 rollback-only proposed migration/creation SQL checks, 63 identity regressions, 14 export regressions, 26 browser checks and 25 HTTP checks pass. No permanent schema/data change, real Person/job, provider, activation or deployment occurred. Applying 0017 requires new authorization beyond the previous approvals through 0016. See [migration review](docs/database/PERSON_CREATION_MIGRATION_0017.md) and [Person creation](docs/phase3/PERSON_CREATION.md).

Current update, 2026-10-17: captured-source pages now support explicit selection and confirmation of an existing Person without a prior Person link. Shared source/Encounter eligibility also protects the writer and Person inspection from new confirmations on inactive captures; historical decisions/replays and rejection remain separate. All 317 tests, application TypeScript, production build/package, 63 rollback-only identity SQL assertions, 16 synthetic-API browser checks and 17 built-app HTTP checks pass. Capture remains disabled; no schema, permanent data, real decision/job, provider, backfill or deployment changed. New Person creation, reviewed reassignment/duplicate reconciliation and typed relationships remain open. See [source-first identity review](docs/phase3/SOURCE_FIRST_IDENTITY_REVIEW.md).

Current update, 2026-10-17: source-backed recall/resurfacing without capture notes is implemented locally. Immutable per-capture text supplies Artifact/Encounter source evidence with exact representation/Unicode provenance, current-head/version checks and archive/link withdrawal. It creates no Person facts and does not search mutable display text. All 315 tests, both TypeScript checks, production build/package, 60 rollback-only source SQL assertions and 15 memory-query regressions pass. Capture remains disabled; no schema, permanent data, provider, historical backfill or deployment changed. Next product work is reviewed source/Person reconciliation and supported relationships; worker/deployed rollout verification remains open. See [source-backed recall](docs/phase3/SOURCE_BACKED_RECALL.md).

Current update, 2026-10-17: v2 source/Artifact resolution and Snapshot/Encounter linking are implemented locally, preserving repeated attention, exact URL variants and separate unidentified sources without assigning a Person/author. Retired/conflicting source mappings preserve original captures unlinked; fenced text projections resist out-of-order completion. The destructive rebuild is retired and the legacy parser rejects v2 snapshots. All 308 tests, both TypeScript checks, production build/package, 36 source-resolution SQL checks, 37 pipeline regressions and 18 isolated HTTP checks pass. All fixtures rolled back; no activation, schema, real notebook mutation, backfill or deployment changed. Source-backed retrieval without capture notes is next. See [source resolution and remaining work](docs/phase2/SOURCE_ARTIFACT_RESOLUTION.md).

Current update, 2026-10-17: installed Chrome verification passes 34 assertions for real storage isolation, worker/alarm recovery, offline/lost-ack delivery, restart/reload persistence, explicit auth resume and quota handling. A full-quota receipt bug is fixed with an atomic acknowledged-source transition and recoverable receipt marker. All 302 tests, both TypeScript checks and production build/package pass. Normal installation/update and natural idle/sleep timing remain unverified. No activation, app database, real capture/job, backfill or deployment changed. Source/Artifact resolution and Encounter linking without guessed Person identity is the next implementation slice. See [verification report](docs/phase2/INSTALLED_EXTENSION_VERIFICATION.md).

Current update, 2026-10-17: extension v2 outbox/background/overlay integration is connected locally and packaged as 0.2.0. Trusted local persistence, bounded retries, explicit auth resume, acknowledgement receipts and truthful queued/saved feedback replace immediate success claims, repeat-save suppression and automatic profile scrolling. All 298 tests, application/extension TypeScript, production build/package and 14 actual-content-script/synthetic-runtime Chrome checks pass. No real capture, database, worker, backfill, activation or deployment changed. Installed-extension suspension/offline/quota/access-isolation checks are next, followed by coordinated worker/source-resolution rollout. See [extension integration](docs/phase2/EXTENSION_OUTBOX_INTEGRATION.md).

Current update, 2026-10-17: separate gated capture-v2 and finite parse-worker runtime entry points are connected locally. The capture gate remains off and no real worker ran. All 285 tests, application/extension TypeScript, production build, 37 rollback-only SQL pipeline checks and 18 isolated built-app HTTP checks pass. No schema, real data, provider, backfill or deployment changed. Extension background/outbox/overlay integration, source resolution and recurring worker-host verification remain open. See [runtime preparation and next steps](docs/phase2/CAPTURE_RUNTIME_PREPARATION.md).

Current update, 2026-10-17: Person/Concept pages now present recorded encounter trails, context and evidence, with legacy projections and hashtag/inferred associations explicitly labelled. Stale Concept counts and implied Person neighbourhood relationships are retired from these pages. All 278 tests, TypeScript, production build, 31 rollback-only trail SQL checks, 15 Person regression checks and 16 signed-out HTTP checks pass. No schema, real notebook mutation, backfill or deployment occurred. Supported relationship/trajectory enrichment and authenticated browser checks remain gaps. Capture-v2/outbox and durable-worker activation preparation is the next slice. See [Person/Concept presentation](docs/phase3/PERSON_CONCEPT_TRAILS.md).

Current update, 2026-10-13: owner-protected Artifact/Encounter/captured-source pages and original-byte downloads are implemented locally, with exact paginated text, context, evidence/history and archived inspection. Street/Walk link to internal inspection. All 272 tests, TypeScript, production build, 23 rollback-only inspection SQL checks, 15 Person-reader regression checks and 19 HTTP checks pass. No migration, real source download, backfill or deployment occurred. Authenticated browser/large-corpus checks remain pending; Person/Concept completion is the next local step. See [inspection integration](docs/phase3/MEMORY_INSPECTION.md).

Current update, 2026-10-13: Walk verification passed 11 two-connection rollback-only Neon contention assertions and 15 headless Chromium checks of the real component with synthetic API responses. Mobile/native keyboard, hidden-tab exposure cancellation, stable retries/lost acknowledgements and completion navigation passed. All 266 tests and TypeScript pass; production behavior was unchanged. No real owner login/Walk, migration, backfill or deployment occurred. Deployed authenticated end-to-end verification remains pending. Artifact/Encounter inspection is the next local migration gap. See [verification report](docs/phase3/WALK_VERIFICATION.md).

Current update, 2026-10-13: the local Walk page/routes now use persistent sessions, current evidence and explicit visibility-based exposure. GET does not create sessions/events; Start/Resume and stable-ID actions use owner write/origin checks. Withdrawn stops close without replacement. The old due selector/interval writer/draft generator are removed from the live path. All 266 tests, TypeScript, production build, 70 rollback-only SQL checks and ten built-route HTTP checks pass. No real Walk, new migration, backfill or deployment occurred. Browser/visibility/mobile/keyboard and contention checks remain pending. See [live Walk integration](docs/phase3/LIVE_WALK.md).

Current update, 2026-10-13: migration 0016 was explicitly authorized and committed on Neon dev through DIRECT_URL. Preflight confirms 17 matching applied entries, 41 public tables and no pending migration. Installed-schema Walk validation passed 59 rollback-only checks and export passed 14; fixtures rolled back/counts stayed unchanged. Idempotency applied zero migrations. No real action, application backfill, private export file or deployment occurred. The prior 258-test/TypeScript/build baseline stands; live session-backed Walk integration is next. See [application report](docs/database/WALK_MIGRATION_0016.md). Earlier entries retain preparation history.

Current update, 2026-10-13: migration 0016, Drizzle definitions/snapshot/journal and complete Walk export compatibility are prepared. The exact 38-table schema retains v2; the complete 41-table schema exports v3. All 258 synthetic tests, TypeScript, production build, no-change schema regeneration, 59 rollback-only migration/export checks and 14 current-schema export checks pass. Read-only preflight confirms 16 matching applied entries and only 0016 pending. No permanent migration, backfill or deployment occurred. New authorization is required for 0016 before subsequent live Walk integration. See [migration review](docs/database/WALK_MIGRATION_0016.md).

Current update, 2026-10-13: persistent Walk session/event services and a three-table SQL proposal are prepared. Membership is frozen at zero to three stops, completion survives navigation, timezone/context changes cannot refill, exposure is separate from selection, and archived stops close without replacements. Selection reasons retain evidence references. All 255 synthetic tests, TypeScript, production build and 47 rollback-only proposed-schema SQL checks pass. Proposed tables are absent after validation; no migration, backfill, real action or deployment occurred. Drizzle/export preparation precedes permanent migration approval and live Walk cutover. See [persistent Walk preparation](docs/phase3/WALK_SESSIONS.md).

Current update, 2026-10-13: contextual Walk composition and a checked read-only candidate adapter are prepared for People/Artifacts, including profile-only People and current immutable notes. The live legacy action adapter no longer fabricates contact after draft intent; clipboard outcomes are truthful. All 251 synthetic tests, TypeScript, production build, 15 rollback-only Walk SQL checks and eight HTTP checks pass. The new selector remains disconnected until persistent sessions/attention events enforce no refill and durable feedback. Legacy scheduling is still active and Phase 5 is incomplete. No migration, backfill or deployment occurred. See [Walk slice and next steps](docs/phase3/CONTEXTUAL_WALK.md).

Current update, 2026-10-13: the interrupted local v2 query integration is complete for this slice. Street queries read current observations and unmapped legacy User notes, display finite evidence matches with provenance/uncertainty, and no longer invoke the earlier answer pipeline. Query HTTP input is strictly bounded and owner/origin protected. All 243 synthetic tests, TypeScript, production build, 15 rollback-only Neon SQL checks, and nine built-route HTTP checks pass. No real query, schema migration, backfill or deployment occurred. Provider evaluation, v2 saved queries, contextual Walk and browser verification remain pending. See [live query integration](docs/phase3/LIVE_MEMORY_QUERY.md). Earlier entries retain history.

Current update, 2026-10-12: new Person notes append immutable User observations; revisions preserve original text through the correction service. Exact text and retry IDs are retained. Legacy in-place PATCH is retired, and earlier notes remain preserved/read-only until reviewed backfill. All 233 synthetic tests, TypeScript, production build and 17 rollback-only authoring SQL checks pass; built-note rejection smoke passed five HTTP assertions. No real note, schema migration, bulk backfill or deployment occurred. V2 recall/resurfacing cutover and browser verification remain pending. See [immutable authoring](docs/phase3/IMMUTABLE_NOTES.md). Earlier entries retain history.

Current update, 2026-10-12: Person archive controls now preserve inspectable history and suppress archived/aliased Persons from active legacy readers. Notes and Walk writes enforce registry locks. ORM/direct SQL pools are separated to protect timestamp/JSON codecs; restart application processes. All 228 synthetic tests, TypeScript, production build and 119 rollback-only compatibility SQL checks pass. The final built app passed 12 HTTP smoke assertions. No real Person archival, migration, backfill or deployment occurred; browser verification and remaining reader/capture migration stay pending. See [archival integration](docs/phase3/PERSON_ARCHIVE_UI.md). Earlier entries retain their history.

Current update, 2026-10-12: the Person page now has dedicated captured-profile identity inspection and explicit confirm/reject controls. Conflicting associations are not automatically resolved, and unsupported/archived captures cannot be confirmed. All 226 synthetic tests, TypeScript, production build, 20 rollback-only identity inspection/decision SQL checks, and 10 built-identity HTTP checks pass. No real identity decision, schema migration, backfill or deployment occurred; interactive browser verification and broader Person/capture migration remain pending. See [identity integration](docs/phase3/IDENTITY_INSPECTION.md). Earlier entries retain their history.

Current update, 2026-10-12: the Person page now has stored observation/evidence inspection and explicit confirm/correct/reject/archive controls under owner sessions. Historical text/truth layers and decision history are retained; identity proofs require separate review. Person metadata is now protected before name lookup. All 221 synthetic tests, TypeScript, production build, 15 rollback-only inspection SQL checks, and 11 built-inspection HTTP checks pass. No new migration, backfill, real review or deployment occurred; interactive browser verification and further Person-page migration remain pending. See [inspection integration](docs/phase3/OBSERVATION_INSPECTION.md). Older entries retain preparation history.

Current update, 2026-10-12: the local review route connects all seven prepared review/archive services to owner-session write authorization and exact HTTPS Origin checks. All 217 synthetic tests, TypeScript, production build, 131 rollback-only Neon review SQL checks, and 10 built-route HTTP rejection checks pass. No real review, new migration, backfill, or deployment was performed; inspection/review UI and HTTPS browser verification remain pending. See [review integration](docs/phase3/REVIEW_ROUTE.md). Earlier entries retain their history.

Current update, 2026-10-12: the local export route now serves the reviewed v2 notebook format under owner-session authorization. The partial legacy exporter was removed; Settings reports download failures. Buffered delivery enforces a 4 MiB cap with explicit failure rather than partial output. All 214 synthetic tests, TypeScript, production build, 14 rollback-only export SQL checks, and 13 built-route HTTP rejection checks pass. No migration, private export file, or Vercel deployment was created; restoration remains deferred. See [export integration](docs/export/MEMORY_EXPORT_V2.md). Earlier entries retain their history.

Current update, 2026-10-12: owner-password configuration passes the private readiness check. Dashboard login/logout, page authentication, and async API guards now use revocable owner sessions in the local codebase; extension capture keeps its separate credential. All 212 synthetic tests, TypeScript, the production build, and 22 built-app HTTP smoke assertions pass. No Vercel deployment or database mutation was performed; HTTPS browser login/cookie verification remains pending. The ledger remains 16 applied entries. See [dashboard integration](docs/phase3/DASHBOARD_AUTH.md). Earlier statements below retain preparation history.

Current update, 2026-10-12: owner-session server composition and private auth:status checks are prepared. All 207 synthetic tests and TypeScript pass. The selected HTTPS origin is saved locally and passes the private readiness check; owner-password configuration remains unready and the runtime database URL is configured. Live login remains disconnected, no database or Vercel deployment was changed, and the ledger remains 16 applied entries. See [server integration contract](docs/phase3/OWNER_RUNTIME.md). Older entries below retain historical counts/state.

Current update, 2026-10-12: migration 0015_shared_login_throttle was explicitly authorized and committed on Neon dev through DIRECT_URL. The ledger has 16 matching applied entries and no pending migrations; actual-schema throttle validation passed 21 rollback-only checks with state/counts unchanged, and an idempotency rerun applied zero migrations. The preparation baseline remains 200 synthetic tests and TypeScript passing. Password enrollment is unconfirmed and live login remains disconnected. See [throttle contract](docs/phase3/LOGIN_THROTTLE.md). Earlier updates below retain their historical counts and migration state.

Update, 2026-10-12: migration 0014 was explicitly authorized and committed on Neon dev through DIRECT_URL. The ledger now has 15 matching entries and no pending migrations. Actual-schema session validation passed 19 checks with fixtures rolled back and state unchanged; an idempotency rerun applied zero migrations. The preceding 211-check complete SQL baseline and 39-check pre-application session run remain separate. The synthetic baseline is 196 passing tests with TypeScript/schema-drift checks passing. Live login/routes, password enrollment, throttling, backfill, and restoration verification remain pending. See [session migration report](docs/database/SESSION_MIGRATION_0014.md).

Phase 0 evidence and open gates: [baseline](docs/phase0/BASELINE.md), [acceptance cases](docs/phase0/ACCEPTANCE.md), and [recovery procedure](docs/phase0/RECOVERY.md). Restoration verification remains explicitly deferred. The initial unchanged-database restriction was superseded for the authorized Neon dev migrations/SQL validation. That authorization did not include application backfill or production cutover. See [Phase 1 status](docs/phase1/STATUS.md). Later phase descriptions retain their preparation history; the dev validation report identifies the schema and SQL now exercised.

Continued local work is recorded in [Phase 2 status](docs/phase2/STATUS.md). Preparing later-phase modules does not assert that earlier database release gates have passed or enable production writers.

The explicit review HTTP boundary is now prepared and tested for observation/identity review and archival. It requires an injected revocable-session permission policy and configured origin; no live route is enabled. See [HTTP contract](docs/phase3/REVIEW_HTTP.md) for action payloads, private error handling, checks, and remaining integration dependencies. This step introduced no SQL changes or new database writes.

A provider-based owner login/logout boundary is now prepared with secure cookie issuance, a mandatory login throttle, single-device logout, and owner-derived all-device revocation. No provider or live route is configured; pending session migration 0014 remains unapplied. See [session HTTP contract](docs/phase3/SESSION_HTTP.md). This slice changed no SQL or database state.

The user selected private owner-password login. Its salted scrypt provider is prepared, along with a session-protected export v2 download factory. Neither loads actual credentials or activates a route. See [password setup contract](docs/phase3/OWNER_PASSWORD.md) and [export integration](docs/export/MEMORY_EXPORT_V2.md). All 189 synthetic tests and TypeScript pass; credential enrollment, throttle deployment, migration 0014 application, and live integration remain pending.

Local initial password setup is now implemented as `npm run auth:setup`, with hidden confirmed input, hash-only `.env` updates, preservation/concurrent-edit checks, and Next-compatible hash escaping. Seven synthetic enrollment tests pass; the current synthetic suite has 196 passing tests and TypeScript passes. The actual repository `.env` was not read/modified by this slice, and no database action was run. The user must enter their private password locally before credential configuration can be completed; throttling and live integration remain pending. Migration 0014's applied state is recorded in the current header/report.

This document proposes implementation order, scope, safeguards, and release gates. It does not authorize implementation, database changes, deployment, or destructive replay. The proposed domain contract is in [DATA_MODEL_V2.md](DATA_MODEL_V2.md).

## 1. Target and authority

Deliver a private memory of people and their work that preserves why they caught the user's attention and makes those discoveries useful again. Prioritize Recall and Resurface on Street, a Person memory page, inspectable evidence, and a finite contextual Walk.

The October 10 updated PRD governs product requirements; the October 10 updated design brief governs the target art direction. The September 20 documents explain legacy decisions. The approved audit supplies the repository findings. Instructions embedded in reference documents are not new execution authorization.

The existing app implements an earlier product hypothesis, not an accepted specification. Existing behavior, schema, UI contracts, and passing typechecks do not establish product correctness. Evaluate each component against the new PRD: reuse it when it demonstrably supports the target; restructure or remove it when it does not. If implementation or design guidance conflicts with product behavior, the new PRD wins.

Preserve user-authored data, source evidence, and reference continuity during migration. This does not require preserving obsolete code, algorithms, screens, database layout, generated classifications, or assumptions. Stable IDs can survive through mappings and aliases while physical storage and application boundaries change.

Repository `design-reference/DESIGN.md` and `docs/micro-interactions.md` still prescribe superseded behavior and styling. Reconcile these references before UI implementation; do not silently combine the old and new visual systems. Proposed details below are engineering recommendations, not claims that the PRD specifies an exact schema or ranking formula.

## 2. Baseline

| Area | Observed implementation, subject to validation | Migration gap |
| --- | --- | --- |
| Home | Street already renders `QuerySurface` | Updated prompt, first-save guidance, object/evidence composition |
| Storage | Postgres, Drizzle, pgvector; stable existing UUIDs | Encounter, Observation, source-neutral identity, evidence relations |
| Capture | MV3 LinkedIn extension; snapshots commit before parsing | Durable retries, immediate acknowledgment, repeated encounters, other selected sources |
| Parsing | Replaceable adapter, quarantine, health, partial coverage | Fact-level evidence and identity-preserving replay |
| Enrichment | Versioned role classification, concepts, synthesis | Input invalidation, durable jobs, reasons and provenance |
| Retrieval | Semantic + structural people search | Notes, education/organization/place constraints, context, abstention |
| Answers | Typed blocks and source snippets | Validated evidence IDs; source/inference separation |
| Person/Concept | Notes, facts, posts, shared concepts | Encounter trail, full artifacts, why-noticed, evidence-backed relationships |
| Walk | Three artifacts, diversity, ending | Profile participation, contextual selection, dismissal and history |
| Design | Whitespace, offset margins, finite lists | Ink/blue/red hierarchy, provenance cues, contrast and fast utility motion |
| Controls | Export, motion, extension download | Complete export, deletion, disclosure, sessions and source controls |

Audit validation: application and extension TypeScript checks passed with incremental writes disabled. Runtime rendering, live database state, provider calls, capture latency, deployment limits, and browser accessibility were not verified. Establish these baselines during implementation; do not treat static findings as measured production behavior.

### Disposition of the earlier hypothesis

| Existing choice | Target disposition | Required justification |
| --- | --- | --- |
| Postgres/Drizzle/pgvector; source adapter boundary | Candidate for reuse | Meets source-neutral domain, evidence, and recovery contracts |
| Snapshot storage and validation/quarantine | Reuse or restructure | Preserves originals without blocking durable Save or unresolved encounters |
| Typed Street block renderer | Reuse the composition approach; revise the contract | Supports people, artifacts, encounters, and inspectable evidence |
| People-only query planner and separate answer retrieval | Restructure | One coherent evidence population and updated Recall/Resurface/Reflect jobs |
| Population gate and citation fallback | Remove | Conflicts with first-capture recall and validated provenance |
| Due/overdue scheduler and four-action interval grammar | Replace | Contextual finite rediscovery, meaningful dismissal, no eventual-due obligation |
| LinkedIn URL as Person identity; post/request-only artifacts | Replace as domain assumptions | Source-neutral identity and authored work across supported sources |
| Topic promotion and concept dedupe thresholds | Re-evaluate; replace/remove if unsupported | Improves recall or relationships without losing provenance or useful concepts |
| Shared-secret dashboard authentication | Restructure | Revocable sessions and proportional privacy controls |
| Parchment/terracotta styling and long utility ceremony | Retire | Updated brief and accessible, immediate utility feedback |
| Placeholder Atlas and experimental City | Remove from MVP navigation unless useful; revisit later | Concrete memory job and implemented behavior, not sunk implementation effort |
| Existing generated summaries and classifications | Retain historical attribution; validate/recompute active use | Existing output is not established fact |

## 3. Scope

### Required before the migrated MVP is ready

- Preserve existing identities, snapshots, user text, and supported historical associations.
- Represent every distinct save as an Encounter, separate from deduplicated Person/Artifact objects.
- Make user reasons and observations searchable, with clearly marked inferred reasons when useful.
- Support useful recall from one captured person; remove the three-person retrieval gate.
- Apply semantic and structured constraints coherently and expose supporting evidence.
- Provide full captured artifact/source inspection and a Person encounter timeline.
- Compose a short Walk using age, salience, diversity, and dismissal; explain meaningful selection reasons.
- Use the updated visual direction, non-color provenance cues, and accessible controls.
- Complete recoverable export, deletion, provider disclosure, and essential session/source controls.

### Staged expansion

LinkedIn profile/post capture ships through the new contract first. Personal websites/portfolios and clearly authored articles/projects follow as explicit adapter releases. The updated source-neutral model must support them from the start; a LinkedIn-only release must disclose its narrower source coverage.

Basic correspondences and richer Concept pages follow reliable Recall/Resurface. A saved project table is optional later: explicit context in a query request is sufficient initially.

### Deferred

Fully visual Atlas, broad universal clipping, annual retrospective, deep low-volume correspondence synthesis, social collections, automatic outreach, complex CRM, learned ranking, and project integrations. City and the placeholder Atlas have no protected place in the migrated MVP; remove them from the active experience unless they support a concrete target job. Their existing implementation does not justify roadmap priority. Do not promise districts at a fixed collection size without implemented behavior.

## 4. Non-negotiable migration invariants

1. Preserve existing user/source references using stable UUIDs or explicit mappings/aliases when restructuring. Do not preserve erroneous entity resolution or an obsolete physical schema merely to keep a row unchanged.
2. Raw snapshots and user-authored text remain recoverable. Backfills never overwrite originals with generated text.
3. Retry of one save request creates one capture/Encounter; a new intentional save creates another Encounter even for the same artifact.
4. Every meaningful generated claim has a truth layer and validated support, or explicitly states that historical support is unavailable.
5. No invented encounter context, note revisions, contact events, published dates, or resurfacing history.
6. Replay/backfill is resumable and idempotent; running it twice preserves reference mappings and correctly recomputed results. Existing derived counts are not a correctness target.
7. Artifact deduplication never deduplicates attention history. Entity merges retain aliases and evidence.
8. User observations outrank weak inference; inference rejection does not delete source facts.
9. The graph is internal support for memory jobs. No user ontology maintenance is required.
10. No review backlog, eventual-due obligation, or dismissal action that increases resurfacing pressure.

## 5. Implementation phases

### Phase 0 — Baseline, decisions, and recovery

Scope: inspect live schema/migration state, actual capture samples and data volume; document the deployment's request/job limits; inventory schema consumers and private metadata loaders. Confirm the proposed object-reference integrity strategy and capture/source identity rules in the companion model.

For each subsystem, record reuse, restructure, replace, or remove, with a new-PRD requirement and supporting validation. Write acceptance cases from the target behavior, not snapshots of the old implementation. Audit historical merges, inferred fields, and aggregates before promoting them into v2 active data.

Prepare a versioned full-fidelity export and verified database backup/restore path before any backfill. Establish representative Recall/Resurface tasks with expected matches and absent-topic cases. Reconcile design guidance with the updated brief. Mark the current `reparse` command unsafe for v2 migration.

Deliverables: consumer inventory, reconciliation queries, recovery procedure, deterministic fixtures, query evaluation cases, and final physical-schema decisions. Relevant files: `lib/export.ts`, `scripts/reparse.ts`, `db/schema/*`, `design-reference/DESIGN.md`.

Original exit gate: restore works in an isolated environment; current identifiers and user/source data can be accounted for; migration assumptions are explicit. Restoration verification is deferred by explicit user instruction for local implementation work. This exception does not authorize database writes or establish migration readiness.

### Phase 1 — Additive domain and historical backfill

Depends on Phase 0, with the user-authorized restoration deferral described above. Prepare the v2 tables/fields and integrity constraints described in `DATA_MODEL_V2.md`, retaining legacy readers and columns. Once database execution is separately authorized, register existing object IDs, add source identities, create profile artifacts, and backfill capture Encounters and Observations using explicit migration keys. Under the current read-only constraint, prepare and validate code without executing these transformations.

Recover only supported history. Preserve snapshotless notes as Person/Artifact user observations. Tag existing generated summaries/classifications as legacy inference with unverified derivation where evidence is unavailable. Preserve legacy scheduling/contact assertions without inventing events.

Do not reset concepts or reuse cumulative edge updates after deleting links. Rebuild derived co-occurrence aggregates from the authoritative active assertion set. Add reconciliation for missing links, orphan references, multiple authors, and quarantined captures.

Deliverables: additive migrations, resumable backfill, mappings/checkpoints, dry-run report, integrity queries. Relevant files: `db/schema/*`, `db/migrations/*`, `lib/merge*.ts`, `lib/parsers/run.ts`.

Exit gate: repeated backfill produces stable mappings and correctly recomputed results; all original captures and notes are accounted for, including unresolved ones. Legacy readers remain usable only as a temporary recovery path. Their behavior is not a release acceptance criterion. Rollback preserves additive records and new capture data.

### Phase 2 — Durable capture and extraction

Depends on Phase 1. Introduce an extension outbox and a persisted idempotency key per intentional Save. Store snapshot, capture Encounter, and optional user reason atomically before acknowledgment. Parse/enrich asynchronously through leased, retryable jobs; quarantine does not erase the Encounter.

Remove same-session repeat-save suppression. Avoid blocking Save on automatic full-page scrolling; capture available content with honest coverage, and make fuller recapture explicit. Replace the confirmation ceremony with immediate state feedback and distinguish queued locally, saved durably, and failed.

Track input fingerprints so richer body text, changed roles, education, and reasons invalidate affected derived records. Resolve identity conflicts transactionally. Validate source adapter outputs and preserve excerpts/locators. No automatic aggressive profile fetching.

Deliverables: versioned capture contract, outbox/retry behavior, processing lifecycle, adapter evidence contract. Relevant files: `extension/*`, `app/api/capture/route.ts`, `lib/capture/*`, `lib/parsers/*`, `lib/merge*.ts`, `lib/enrich/*`.

Exit gate: failed delivery survives reload; retry creates no duplicate Encounter; repeated Save creates a new Encounter; parse/provider failures preserve captures; recapture refreshes stale derivations. Acknowledgment latency is measured separately from enrichment time.

### Phase 3 — Retrieval and evidence-first answers

Local progress: baseline Recall/citation fixes, disconnected planning/retrieval/structured-answer orchestration, immutable snapshot text/locator schemas (unapplied migration 0012), injectable persistence/read-only reader adapters, versioned LinkedIn normalization/field extraction, fenced processing integration, explicit identity confirmation/rejection, typed capture-field derivation references (unapplied migration 0013), and current-input derivation filtering are prepared. Rejection and parse-head invalidation share a transaction; historical retries never reset later identity choices. See `docs/phase3/STATUS.md` for validation and remaining gaps. Phase 3 remains incomplete; no database changes or provider evaluation were performed.

Depends on Phases 1–2. Plan requests as Recall, Resurface, or Reflect without requiring UI mode tabs. Remove the population gate for Recall. Index original notes/reasons, artifact text, extracted facts, and clearly typed inference; education and employer/location cues must not depend solely on generated summaries.

Add explicit school, organization, place, source, encounter-date, and relationship constraints. Preserve ambiguous dates and identities. Retrieve a coherent candidate/evidence set for mixed queries before synthesis. Add relevance thresholds and uncertain-match/abstention states; calculate coverage for the actual query population.

Use stable evidence IDs in bounded model context and validate returned claim citations. Remove fallback that treats all retrieved documents as support for unresolved citations. Generated summaries can help retrieval but cannot masquerade as source material. Reflection requires a defined population and evidence coverage; otherwise explain insufficient support.

Deliverables: planner/ranker contract, typed evidence response, evaluation report. Relevant files: `lib/search/*`, `lib/ask/*`, `lib/query/*`, `app/api/query/route.ts`.

Exit gate: first-capture recall, note-only clues, EPFL-plus-topic filtering, coherent mixed queries, absent-topic abstention, and valid citations pass. User observations have a tested ranking advantage over equally relevant weak inference.

### Phase 4 — Street, Person, Artifact, and updated design

Depends on Phase 3; design exploration may begin after Phase 0. Extend the typed block registry with Artifact, Encounter, evidence, and optional correspondence presentations. Keep concise answers and finite object lists.

Street uses the updated prompt and real first-save examples. Person shows identity → why noticed → encounters → trajectory → work/ideas → supported correspondences/relevance → source access. Provide complete Artifact reading and immutable snapshot inspection. Concept shows appearances through people/artifacts and personal observations, rather than acting primarily as a folder with counts.

Replace parchment/terracotta tokens with contrast-tested paper/ink/ink-blue/signal-red roles; exact hex values and font selection remain prototype decisions. Use visible truth labels alongside type/color. Reserve ceremony for meaningful discovery; utility feedback remains fast. Reduced motion preserves relationships and avoids unnecessary timer waits.

Deliverables: revised reference guidance, reusable provenance/evidence components, source inspection, first-save onboarding. Relevant files: `app/*`, `components/query/*`, `components/person/*`, `components/sheet/*`, `lib/views/*`, `app/globals.css`, `app/frame.css`.

Exit gate: readers can identify why a result appeared, their own words, source facts, inference, and next action. Keyboard/mobile submission, focus, dialog behavior, reading order, source access, and text contrast are verified in browsers.

### Phase 5 — Contextual finite Walk

Depends on Phases 2–4. Replace due-date selection with a transparent candidate score over age, user salience, repeated encounters, optional explicit/recent context, novelty/change, diversity, and negative feedback. Weights are an evaluation decision; do not invent a trained ranking system.

Include People, Artifacts, and later supported Correspondences. Store a bounded Walk session, selected stops, selection reasons, actual exposures, and actions. Profile-only captures participate. Dismissal reduces resurfacing; low-value objects can fade without becoming due. A completed session does not refill on navigation.

Provide open/linger, keep/useful, reduce resurfacing, and optional contact. Draft generation and clipboard actions report their actual outcomes. Only explicit user confirmation changes contact state; opening a profile or copying text does not prove contact.

Deliverables: selector, event history, session boundary, accessible controls. Relevant files: `lib/walk/*`, `components/walk/*`, `app/api/walk/*`.

Exit gate: a session ends after at most three stops, survives navigation, includes profile-only candidates, explains meaningful reasons, and decreases exposure after dismissal. No backlog/overdue signal remains.

### Phase 6 — Privacy, controls, cutover, and cleanup

Depends on Phases 1–5; authorization/metadata fixes and provider disclosure can ship earlier. Separate revocable dashboard sessions from capture credentials; protect private metadata loaders; add logout and proportionate request/login protections.

Implement deletion, inference correction/rejection, source/adapter permissions, provider disclosure, and complete versioned export. Verify deletion invalidates search, jobs, correspondences, caches, and restored-reference assumptions. Verify provider requests follow the configured controls.

Cut over readers in stages behind reversible deployment/configuration switches. Retire the legacy interval scheduler and unsafe replay path after target-PRD acceptance and recovery gates pass; reproducing old behavior is not required. Temporarily retain old storage for recovery, then remove obsolete code, routes, projections, and tables through a reviewed cleanup once reference continuity and user-data recovery are verified.

Exit gate: privacy/data controls work, full export/restore works, v2 readers account for legacy and new captures, and rollback preserves data created after cutover.

### Phase 7 — Selected sources and useful correspondences

Depends on the v2 capture/evidence contract. Add personal websites/portfolios, then clearly authored articles/projects. Resolve cross-source identities conservatively; ambiguous authors remain unresolved without blocking capture.

Add evidence-backed correspondences to Street/Person/Concept/Walk with uncertainty and dismissal. Only then evaluate Atlas, collection reflection, and trajectory clusters against concrete user questions. Reflection/Atlas may remain deferred without blocking the migrated MVP.

## 6. Historical mapping and unknowns

| Legacy data | Migration treatment |
| --- | --- |
| Person/Artifact/Concept/Organisation | Keep IDs; register references; add source identities |
| Profile snapshot without artifact | Create/reuse a profile-page Artifact; preserve original snapshot and Person IDs |
| Snapshot | One historical capture Encounter per snapshot, including quarantined/unlinked captures |
| Snapshot-linked note | Current known user text linked to that Encounter; original capture-time wording may be unknown |
| Snapshotless note | User Observation; no invented capture Encounter |
| Role/education/skill/headline history | Retain IDs/data; attach evidence only when recoverable |
| Synthesis/domain/mode | Legacy Inferred observations; preserve prompt/model metadata and support uncertainty |
| Hashtags/concept links | Preserve source terms and inferred assertions separately; flag unavailable inferred wording |
| Schedule | Preserve as legacy state; at most one last-known action record, never a fabricated full history |
| Artifact relationship status | Legacy assertion; no invented sent/replied timestamp or confirmed contact event |
| Saved query | Preserve IDs/text; version or replan routing; retain original routing for inspection |

Existing note edits have no revision timestamps. Do not label a note's current body as its original capture-time body. Artifact published dates, missing past actions, and original unsupplied motivations remain unknown.

## 7. Validation and release gates

| Gate | Required evidence |
| --- | --- |
| Identity/history | Original references resolve through stable IDs/mappings; snapshots/notes accounted for; no duplicate retry encounters |
| Replay | Two runs produce identical mappings, validated active assertions, and correctly recomputed counts |
| Recall | One-person corpus; note-only cue; school-plus-topic; transition with uncertain dates |
| Reasoning | Mixed answer/list coherence; unsupported-topic abstention; citation integrity; inference labeling |
| Capture | Offline/reload retry; repeated intentional saves; quarantine; richer recapture; concurrency |
| Walk | Profile candidate; three-stop boundary; resume; dismissal suppression; no false copied/contact state |
| Controls | Export/restore; deletion closure; inference rejection; private metadata; session revocation |
| Design | Actual-use contrast; keyboard/screen reader; mobile submission; reduced-motion equivalents |

Add meaningful assertion-based tests for these contracts. Keep the live `test-search` script as supplementary evaluation, not a regression suite. Run app/extension typechecks and an isolated production build for implementation changes; never use production mutation scripts as tests.

A passing legacy test or typecheck is insufficient when it encodes the earlier hypothesis. Update or remove such tests and validate the new PRD's outcomes. Compatibility is required for retained user data and references, not for superseded scheduling, ranking, navigation, or response composition.

Record capture acknowledgment latency, recall success on user-authored tasks, source/person/artifact opens, usefulness feedback, and incorrect inference reports with minimal necessary logging. Do not optimize streaks, review completion, or feed depth. Set numeric targets after baseline measurement rather than inventing them here.

## 8. Cutover and rollback procedure

1. Verify full backup/export and restoration in isolation; record schema version and reconciliation baseline.
2. Deploy additive schema and compatible writers before enabling new readers. Use dual-write only inside defined atomic transactions, with explicit retry keys.
3. Backfill in checkpointed batches; reconcile historical and newly arriving captures without pausing or losing them.
4. Compare old/new retrieval and views on controlled fixtures and representative captures; inspect privacy and evidence failures.
5. Enable v2 readers by surface, then enable contextual Walk. Keep the legacy data available read-only.
6. On failure, disable new readers/selectors and continue accepting captures through a compatible writer. Preserve v2-only records; do not restore an old backup over newer user data.
7. If legacy readers cannot represent newer source types, retain a compatible read-only inspection path rather than hiding or deleting those captures.
8. Perform destructive cleanup only after separate review, stable operation, and verified export/restore. Keep migration checkpoints and identity aliases.

## 9. Decisions to finalize before their dependent phase

| Decision | Proposed default | Needed by |
| --- | --- | --- |
| Object reference integrity | Shared reference registry with stable subtype UUIDs and enforced subtype contract | Phase 1 |
| Capture idempotency | Client-generated request UUID per Save; reuse only for retry | Phase 2 |
| Background execution | Durable database jobs with leases/retries; hosting worker choice after limits are inspected | Phase 2 |
| Historical evidence | Preserve unknown support explicitly; no generated reconstruction presented as fact | Phase 1 |
| Person/entity ambiguity | Keep candidates separate until deterministic evidence or user confirmation | Phase 2 |
| Ranking weights/thresholds | Transparent deterministic baseline tuned on recall fixtures | Phases 3/5 |
| Walk boundary | Persisted local-day session, up to three stops, explicit timezone | Phase 5 |
| Palette/fonts | Prototype and contrast-test updated roles; no fixed hex/font prescription yet | Phase 4 |
| Snapshot retention | Preserve by default; explicit deletion/export controls and disclosed provider handling | Phase 6 |
| Source expansion order | LinkedIn through v2 first, then personal sites/portfolios, then authored articles/projects | Phase 7 |

Phase 0 added inspection tooling, synthetic evidence tests, and documentation. Phase 1 now prepares domain schemas, unapplied migrations, and deterministic dry-run planning. Database transformation, new capture writers/readers, UI changes, hosting changes, and release actions remain future work.
