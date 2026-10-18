# Reviewed captured-profile relationships

Implemented locally on 2026-10-18 using the existing schema. Future explicit profile identity confirmation, Person creation, reassignment and rejection now maintain a versioned `profile_of` relationship with inspectable support. Person and Artifact pages expose a private read-only relationship inspector. Capture-v2 remains disabled. No historical backfill, real decision, permanent data/schema change, provider request or deployment occurred.

## Meaning and scope

`profile_of` here records an owner-confirmed association in captured material. It does not establish the source's current external identity, authorship, content ownership, publication time or equivalence between people. Recorded source identity remains on the Artifact/Snapshot; Person identity remains a UUID and an explicit per-capture decision.

Only active canonical, resolver-versioned profile-page Artifacts with v2 captured Snapshots and explicit source links are managed. Materialization requires a current verified User identity proof from the explicit identity-confirmation namespace, a sole matching noticed-Person link and a supported active capture. Unreviewed source claims, legacy Person projections, coincident URLs, parsed names and post captures cannot create these relationships.

One logical Artifact/Person/predicate pair has one relationship row. Repeated confirmations/captures add independently inspectable support assertions rather than duplicate edges. The managed origin namespace is `reviewed-profile-v1`. A pre-existing endpoint row in another namespace is preserved without adoption, new support or activation. Explicitly rejected managed relationships remain rejected. No `authored_by`, education/employment, semantic correspondence or Person alias/merge is inferred by this step.

Existing historical identity proofs are not automatically backfilled. Only the Snapshot receiving a new explicit decision gets a new support assertion. An unchanged request replay creates no relationship/support rows and does not repair or reactivate history.

## Support and current state

Each managed edge is supported by an immutable Artifact observation with role `relationship_assertion`, layer `extracted` and support status `partial`. This is a deterministic projection of the owner's decision, not a newly verified source fact or quotation. Its structured fields retain the target Person, Snapshot and identity proof. A supporting-observation evidence link binds it to the User proof; `relationship_support` binds the assertion to the edge. This satisfies the existing relationship endpoint/support guards without presenting User identity confirmation as external source verification.

The existing identity decision transaction adds support and reconciles edge state while it already holds the memory graph lock. Person/proof/Encounter changes, dependency invalidation, parse enqueueing and typed relationship support commit or roll back together. There is no provider, background entity lookup or new schema migration in this path.

The reader independently rechecks active canonical Artifact, Encounter, proof and Person records; supported capture kind/adapter; source and noticed links; reviews, supersession and aliases; managed assertion metadata; and exact proof/Snapshot/Person linkage. Assertion review/archive also removes eligibility. Generated profile assertions direct generic observation inspection to captured-profile identity review, preventing an independent generic confirmation from promoting their association.

Eligible current captures naming different people make the managed edges candidates and the reader labels them as a conflict. It does not choose the newest capture or infer that equal URLs identify the same Person. Multiple proofs or mismatched/multiple noticed links within one capture cannot support an edge. Conflict comparison uses eligible unambiguous captured associations; this does not resolve excluded ambiguous or unsupported history.

Rejection, supersession or reassignment withdraws support from the old proof while preserving its assertion and relationship history. Other still-valid capture support can keep the same logical edge supported. A new valid proof can supply a new edge after reassignment. Archived/aliased or unlinked sources cannot supply current support. Generic archive/review paths may leave stored edge state unchanged until a later explicit identity decision reconciles it, so **stored `active` alone is never eligibility**: the reader labels missing current support as historical.

Direct User notes and captured words remain unchanged. The relationship does not transfer captured source text into Person facts or infer its author. Existing source-backed lexical retrieval and structured capture facts retain their separate provenance rules; typed relationship query constraints and semantic relationship recall are not implemented here.

## Inspection and authorization

Person and Artifact pages have a **Reviewed profile relationships** section. Its explicit inspect action reads `GET /api/relationships/[kind]/[id]` under the existing revocable owner read-session policy. Authentication precedes parameter validation and all object data reads; capture credentials do not grant access. The endpoint supports no mutation method and returns private uncached responses with sanitized failures.

The read model uses repeatable-read/read-only transactions and statement timeouts. It pages relationships by UUID in groups of 20, with a real next cursor. Each edge links to both endpoint pages and the supporting Snapshot/Encounter records. Supported, conflicting, candidate, rejected and historical states remain visibly distinct. A failed refresh clears the prior relationship result instead of presenting it as refreshed support.

Proof and support populations have explicit 1,000-row ceilings per source and fail instead of silently truncating eligibility/conflict detection. Each displayed edge shows at most 20 support links with its complete current support count and an explicit notice when more exist; the Artifact's capture pages preserve the full trail. Large-source performance remains unverified.

## Validation

- All 336 synthetic tests, application TypeScript and the production build/package pass. Five new pure policy cases cover exact owner-proof/source linkage, ambiguous proofs/links, conflicting versus repeated source identities, rejected/candidate/history states and independent capture support provenance.
- `node scripts/database/validate.mjs --profile-relationships-only` passes 38 rollback-only Neon dev assertions through `DIRECT_URL`. It exercises actual capture/confirmation materialization, partial extracted assertions and dedicated review guards, replay, repeated support, conflicting people, rejection recovery, reassignment, archival withdrawal, no invented authorship, legacy endpoint preservation, rejected managed edges and relationship pagination. Actual read-only wrapper behavior is included. All fixture data rolls back and aggregate/relationship/support/Artifact counts remain unchanged.
- Existing identity inspection passes 63 rollback-only regression assertions, reassignment passes 44, and installed-schema Person creation passes 40. Together with the focused fixture, all 185 SQL assertions pass with data rolled back and counts unchanged. Only synthetic fixture jobs are processed.
- The real source-review and relationship components pass 45 headless Chromium checks with synthetic APIs, including explicit read-only inspection, support links, conflict/history labels, relationship pagination and unavailable responses. No real owner login or database is used.
- The production app passes 37 isolated HTTP checks with synthetic private settings and an unreachable fixture database. New coverage confirms signed-out and capture-secret access cannot read relationship data, malformed targets do not bypass authentication and writes to the read endpoint are rejected.

One creation-regression attempt lost its connection and a retry hit an idle transaction's graph lock. Read-only aggregate diagnostics confirmed the lock and later confirmed it cleared without terminating a session. The creation fixture now sets a transaction-local 30-second idle timeout, so future disconnects cannot retain that fixture's transaction indefinitely. Its final rerun passes all 40 installed-schema checks. This is a validator setting, not a production or role configuration change. The diagnostic command prints only lock counts and age, never backend identities, SQL text or credentials.

No real capture/Person/job/identity decision, permanent database write, migration, backfill, private export, provider request or deployment occurred. Browser fixtures use an isolated temporary profile. The full SQL suite, successful committed concurrency, deployed owner-authenticated flows, high-volume performance and complete mobile/accessibility verification were not exercised. Backup restoration verification remains deferred.

## Next work

Reviewed authorship and other typed relationships need their own explicit evidence and review policies. Person/source duplicate reconciliation, ambiguous/already-rejected identity resolution and typed relationship retrieval remain open. Recurring worker hosting/readiness, enabled/deployed integration, calibrated semantic recall, normal extension installation/update and separately reviewed historical backfill also remain open.
