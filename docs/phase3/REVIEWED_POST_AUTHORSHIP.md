# Reviewed post authorship

Follow-up, 2026-10-18: [Person and Artifact authorship panels](AUTHORSHIP_PANELS.md) now provide direct read-only inspection using these same support rules. The original implementation scope and validation record below are retained.

Implemented locally, 2026-10-18. The updated PRD's Artifact author field is supported through explicit owner decisions on saved LinkedIn posts. Source resolution and profile identity remain independent of authorship. No schema migration is needed; the installed 0017 schema is unchanged.

## Owner flow

On a captured post's source page, choose **review post authorship**, search existing people by name, explicitly select an author, enter a reason, review the decision and save. Merely opening, searching or selecting does not write anything. There is no URL matching, automatic name matching, profile-based author inference or automatic Person creation.

The page shows the source Artifact's managed authorship history, exact confirmation and withdrawal reasons, Person links, supporting captures and current Encounter links. An author can have support from several captures. Multiple authors have independent decisions rather than being treated as an identity conflict. Withdrawing a decision requires opening its own capture and naming its exact current assertion; support from other captures and other authors remains.

The confirmation screen freezes the request UUID and payload. A lost acknowledgement can be retried with exactly the same request. Changing a previously used request conflicts. Replaying an earlier confirmation after withdrawal returns its historical receipt and cannot reactivate it. New confirmation after withdrawal requires a new explicit decision. A failed refresh clears displayed results rather than leaving a stale claim visible.

## Storage and validity

- One managed `authored_by` edge connects the source Artifact to each explicitly selected existing Person. Its deterministic namespace is `reviewed-authorship-v1`.
- Each confirmation appends an immutable Artifact-subject **User** Observation with role `relationship_assertion`, field `reviewed_authorship`, support `partial`, the exact owner reason and structured request/Snapshot/target provenance. `relationship_support` connects the assertion to the edge. The namespace is `reviewed-authorship-decision-v1`.
- This is an owner assertion, not an extracted or independently verified author fact. The capture is a review context; no source quotation, text locator or extracted Person fact is invented. No Encounter `noticed` Person link is added.
- Withdrawal appends a rejected ObservationReview. Its comment encodes the exact normalized decision, including its original reason, to provide an immutable replay receipt without adding a table. The authorship reader validates that receipt and displays the reason as text. Original confirmation text remains unchanged.
- A new decision requires an active canonical Person, source Artifact and captured Encounter, a linked v2 capture request, the explicit Encounter/source link, supported post adapter/type and recorded content hash. Archived, aliased, unsupported and unlinked inputs cannot authorize a new decision.
- Readers recheck support against current capture, Person, assertion, review and supersession state. They display owner-confirmed, candidate, historical or rejected status; a stored active flag alone is insufficient. Rejecting the managed edge is never undone by this service. Legacy endpoint collisions are blocked rather than adopted or overwritten.
- The existing dependency transaction locks object processing scopes before the memory graph. Withdrawal invalidates dependent assertions/relationships and fences affected enrichment/index jobs. Confirmation also invalidates the Artifact/Person enrichment/index scopes. Authorship decisions neither alter profile identity nor queue or change parse work.
- Generic Observation confirmation/correction/rejection/archive controls cannot bypass this dedicated review. The existing internal `identityProof` boolean is a source-association review-routing guard here, as it already is for generated profile relationship assertions; it does not assert that authorship is identity proof. The generic inspector directs owners to the captured source.

## Private boundaries and bounds

`GET /api/snapshot/[id]/authorship` is owner protected, read only, repeatable read and private/no-store. Authentication precedes UUID/query parsing. Search is literal case-insensitive name matching with UUID pagination, 20 people per page, and no default selection. Duplicate/unknown query parameters are rejected. More than 200 managed assertions for one Artifact fails explicitly rather than silently truncating support/history.

Writes use the existing `POST /api/review` action `review_authorship`: owner write permission, exact configured HTTPS Origin, bounded JSON, strict payloads, normalized UUIDs and a nonblank reason of at most 2,000 UTF-16 units. Private driver/provider details are not returned. Source text and owner reasons are rendered as text.

## Validation

- All 344 phase 0–3 tests pass, including eight new strict-input and review-boundary tests. Application TypeScript and the production build/extension package pass.
- Focused Neon dev validation through `DIRECT_URL` passes 60 rollback-only checks. Coverage includes actual v2 post captures, explicit User assertions, exact reasons, read-only reader wrapper, replay/conflict/stale guards, co-authors, repeated-capture support, independent withdrawal, renewal, archival withdrawal, unsupported profiles, legacy collisions, rejected edges, no inferred Person/identity links, generic review bypass prevention and unchanged parse fingerprints. Transitive relationship invalidation and index-head/job fencing are checked. Fixture rows roll back and aggregate/relationship/support/Artifact counts remain unchanged.
- Existing profile relationship validation passes 38 rollback-only regression checks with counts unchanged.
- Actual source/relationship/authorship components pass 62 headless Chromium checks against synthetic APIs. New coverage includes explicit search/selection/review/cancel, frozen lost-acknowledgement retries, exact reasons, support links, withdrawal and its visible reason, inactive/error states and a narrow viewport.
- The built app passes 52 isolated HTTP checks. New coverage includes signed-out/capture-secret rejection, authorization before malformed-input parsing, foreign-Origin rejection, read-endpoint method restriction and denied unauthenticated authorship writes. This harness uses synthetic private configuration and an unreachable fixture database.

No real owner login, capture, Person, authorship decision, queued-job execution, provider request, permanent database change, migration, historical backfill or deployment was performed. Capture-v2 remains disabled. Backup restoration verification remains deferred as requested. These checks do not establish deployed HTTPS success, committed concurrency, production-scale performance or a complete accessibility audit.

## Remaining work

Authorship is currently reviewed and inspected on captured-post source pages. Direct Person/Artifact authorship panels, typed relationship query constraints, Organisation authors, other source adapters, automatic evidence extraction and other typed predicates are separate work. Existing profile identities do not acquire authorship automatically. Correcting an author uses explicit withdrawal and a separate new author decision; there is no atomic author reassignment or Person merge in this slice.

Duplicate/source reconciliation, ambiguous or already-rejected profile identity resolution, recurring worker hosting, enabled/deployed capture integration, calibrated semantic recall and separately reviewed historical backfill remain open.
