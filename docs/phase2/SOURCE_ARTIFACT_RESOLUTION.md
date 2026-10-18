# Source Artifact resolution and Encounter linking

Follow-up, 2026-10-17: source-backed recall/resurfacing is now implemented with current-version, exact-quotation evidence independent of display text. See [source-backed recall](../phase3/SOURCE_BACKED_RECALL.md) for the current behavior, 315 passing tests and 60 source/15 query rollback-only SQL checks. The implementation record and next-work section below describe this earlier source-resolution slice.

Implemented locally on 2026-10-17. V2 saves now resolve a recorded source document, create or reuse its Artifact, and commit its Snapshot/Encounter source links with the original capture, optional User reason, job and request receipt. Capture activation remains off. No provider, Person discovery or authorship inference is involved in the save transaction.

## Identity policy

The resolver distinguishes a document's recorded source identity from a Person's identity. A profile page can recur at exactly the same URL without asserting that its current contents identify the same person over time. No `person_id`, `organisation_id`, `profile_of` or `authored_by` association is created by this step.

- Profile-page captures under `/in/…` use their exact supplied source URL as a document key. Query strings, fragments, path variants and other meaningful URL differences remain distinct. The URL is hashed into a bounded external key so an otherwise valid long URL does not exceed PostgreSQL index-key limits; its full exact value remains stored and checked.
- Recognized post URNs in the activity, ugcPost or share namespaces use a namespace-sensitive stable post key and recorded canonical post URL. A feed save and a direct-URL save with the same recorded URN can share one Artifact while preserving separate Snapshots and Encounters. A matching numeric suffix in a different URN namespace is not enough to merge sources.
- Feed cards without a stable identifier, unsupported URN namespaces, conflicting supplied/URL post identifiers, and profile capture kinds at unrelated URLs get separate per-Snapshot Artifacts. They are not merged by feed URL or identical HTML. Their source-resolution metadata records the snapshot-only basis and reason. Later reconciliation remains explicit work.

These are associations based on recorded capture metadata, not proof of external identity, publication, content ownership or URL-to-content entailment. The original submitted URL/URN remains in immutable capture/context records where a canonical post URL is used. Source identities use the existing `source_identity` table with an extracted resolution layer and no invented confidence/assertion. New Artifacts use versioned `capture-source-v1` migration keys. No schema migration is needed.

Only mappings matching this resolver's kind, exact canonical URL, Artifact type, migration key and resolution policy are automatically reused. An archived or aliased mapping is not reactivated, followed or rebound. A conflicting mapping is not overwritten. In those cases the original Snapshot, captured Encounter, optional User reason and parse job are still saved, but Artifact linkage remains unresolved with an explicit context reason. No replacement active Artifact is invented for a retired registered identity.

The resolver does not adopt older Artifact rows merely because a legacy URN, Person projection or profile URL matches. New source identities occupy their own versioned namespace, and new rows leave the legacy `artifact.urn` projection empty to avoid its older unique-index semantics. Existing legacy rows remain unchanged. This can leave old/new duplicates until reviewed reconciliation; it avoids implicitly executing historical backfill or promoting old attribution into supported facts.

## Atomic saves and projections

All source-resolution writes happen inside the existing durable save transaction. The request UUID still serializes retries; unchanged retries return the original records, and changed input remains a conflict. A new intentional save can share a source Artifact but always retains a distinct Snapshot and Encounter. Snapshot `artifact_id` and the Encounter's `source` object link are recorded explicitly. User reasons remain User observations on their own Encounters and can flow through those source links in the existing retrieval reader.

Source resolution takes the existing memory graph lock before validating source rows or updating Artifact metadata. Statement/lock timeouts remain bounded. Artifact first/last capture projections use trusted server receipt times; the raw client capture clock remains separately stored and labelled unverified. Source-state decisions and their version/basis are recorded in Encounter source-context JSON. Replays do not manufacture new attention or change capture time. URN length is now bounded at 256 characters in both server and extension validation.

New Artifacts begin without guessed body text. Successful normalization can project the current captured text into their display `body_text`, inside the job's existing lease-fenced completion transaction. Projection requires an active canonical Artifact/Encounter, a real v2 capture request, the explicit source link and this resolver's versioned Artifact key. Ordering uses server receipt time plus Snapshot UUID, so an older job completing late cannot overwrite a newer capture's display text. Each original gzip payload and immutable normalized representation remains separately inspectable. A newer pending/quarantined capture does not authorize copying an older late result over it; an already stored older display projection may remain until a newer valid result arrives.

This display projection is not a source-fact observation, verified identity or publication date. Capture/processing can succeed while Person identity remains unresolved. Missing/ambiguous adapter roots still quarantine processing independently of the saved original and its source record.

## Legacy-path protection

The old `reparse` command deleted and rebuilt Person/Artifact rows, which would discard stable v2 identities and associations. Its implementation is retired and returns `LEGACY_REPARSE_RETIRED` without importing a database connection or parser. The old parser also refuses any Snapshot registered in `capture_request` with `VERSIONED_CAPTURE_REQUIRES_DURABLE_PROCESSOR`, before parsing/merging. The existing legacy capture route remains a compatibility path for its own captures; it cannot process v2 captures through this parser entry point. No destructive rebuild was run.

## Validation

- All 308 synthetic tests pass. Six new cases cover repeat profile-document identity without Person equivalence, exact URL variants/long keys, stable post identifiers and distinct namespaces, unidentified/conflicting sources, kind/URL boundaries and bounded URNs, plus database-free retirement of the destructive CLI.
- Application and extension TypeScript checks and the production build/package pass.
- `node scripts/database/validate.mjs --source-resolution-only` passes 36 rollback-only Neon dev assertions through `DIRECT_URL`: actual Artifact/Snapshot/Encounter writes, exact retries and repeated attention, no guessed attribution, newest-first fenced text application, distinct preserved representations/originals, User reason retrieval through source links, long URLs, old-row preservation, unknown/conflicting source separation, archived/aliased/conflicting mappings, source-identity uniqueness and legacy-parser refusal. The fixture explicitly processes only its own synthetic job IDs; it does not claim real queued jobs. Aggregate application counts and additional Artifact/source-identity/link/request counts remain unchanged after rollback.
- The existing capture/outbox/processing pipeline passes its separate 37 rollback-only regression checks.
- The built capture route passes 18 isolated HTTP checks with synthetic credentials, capture disabled and an unreachable fixture database. Authorization and disabled paths still need no database connection.

No real capture/job, permanent data change, schema migration, backfill, provider request or deployment occurred. Credentials/private rows were not printed. The full SQL suite, successful concurrent commit/replay tests, load testing and a deployed enabled pipeline were not exercised. Earlier installed-extension lifecycle tests are historical evidence and were not rerun for this server-focused slice.

## Next work

The immediate gap is source-backed retrieval for Artifacts saved without a User note. This step connects source objects and their inspection text; it does not automatically turn a mutable display projection into current, quotation-backed retrieval evidence. The next slice should connect normalized captured-source evidence to recall/resurfacing with proper version/eligibility handling, without requiring a capture reason or attributing the source to a Person.

Reviewed source/identity reconciliation, supported typed relationships, recurring worker hosting, deployed integration/latency verification and normal extension installation/update checks remain open. Old captures and duplicate source records still need separately reviewed historical backfill/reconciliation. Capture-v2 stays disabled until the remaining rollout prerequisites are met. Backup restoration verification remains deferred.
