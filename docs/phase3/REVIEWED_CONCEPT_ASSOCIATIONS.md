# Reviewed Concept associations

Implemented locally, 2026-10-18. Owners can associate an existing Person or Artifact with an existing Concept and preserve their reason. Person/Artifact pages provide explicit review controls; Concept pages provide reverse inspection and withdrawal. The existing 0017 schema supports this slice without a migration.

## Product meaning

`associated_with_concept` records an owner-reviewed interpretation. It does not establish that a source mentions the idea, that a Person has expertise in it, or that an author/profile association propagates to a Concept. It is separate from `mentions_concept`, captured hashtags, inferred topics, legacy `concept_link` rows and concept co-occurrence counts.

Existing Concept labels/categories are shown as stored catalogue data, not trusted source evidence. Owners search labels, select a specific UUID, enter their own reason and explicitly review/save. There is no default selection, automatic Concept creation, alias resolution, merge or promotion of earlier inferred links. Duplicate labels remain separate choices. Organisation subjects and other predicates remain unsupported.

This is a foundation for the PRD's idea trail, not a claim that adjacent concepts, automatic extraction, correspondence discovery or trajectory analysis are complete.

## Review and history

Confirmation freezes the request UUID, subject/Concept IDs, exact reason and expected Concept label/category. A changed label/category between selection and save produces a conflict. Renaming/reclassifying an existing Concept retires old support at read time; the original meaning and reason remain visible in history. A still-unreviewed decision can be withdrawn even after its meaning becomes historical, before explicitly reviewing the changed Concept.

Withdrawal names the exact supporting Observation and appends an immutable review with its own reason. Changed payloads cannot reuse an earlier request ID. Lost acknowledgements retry the frozen payload. Replaying an old confirmation returns its historical receipt and cannot restore withdrawn support. A new association after withdrawal needs a new explicit decision. Reasons are never edited in place.

Archived/aliased subjects, Concepts or proofs cannot support a current association. A rejected managed edge cannot be revived. Legacy endpoint collisions are blocked instead of adopted. Candidate support is labelled without claiming an active relationship.

Panels show current owner-reviewed, candidate, rejected and historical states; link both ends; and preserve the Concept's label/category at each decision. Relationship pages, Concept-search matches and individual proof-history pages have separate scoped UUID cursors. A history cursor cannot read an edge outside the requested object. All history within the supported per-edge bound is inspectable rather than hidden behind the first 20 decisions.

## Storage and dependency policy

- Deterministic managed edges use `reviewed-concept-v1:<subject>:<concept>` and predicate `associated_with_concept`.
- Confirmation appends a User/partial `relationship_assertion` Observation on the Person or Artifact, field `reviewed_concept`, with exact reason and structured frozen request. Its namespace is `reviewed-concept-decision-v1`. `relationship_support` retains the decision without fabricating a captured-source quotation or locator.
- Withdrawal appends a rejected ObservationReview. Its comment encodes the normalized request as an immutable idempotency receipt; readers validate it and display the reason as text.
- The existing dependency transaction locks subject/Concept enrichment/index scopes before the memory graph. Decisions invalidate dependent assertions, supported relationships and affected enrichment/index work. This slice does not enqueue parsing, mutate capture/identity decisions, invoke providers or rewrite Concept catalogue rows.
- The shared review graph adds a dedicated `relationshipReview` guard for these decisions instead of classifying them as profile identity proofs. Generic Observation confirmation, correction, rejection and archive cannot bypass the Concept review policy; inspection actions direct owners to the relationship controls.
- The review graph and ordinary retrieval reader also retire these assertions, and their dependent evidence, when the target Concept is archived, aliased, renamed or reclassified. Direct User notes remain separate. Merely retaining a raw active edge or stale Observation cannot establish current reviewed support.

Legacy concept enrichment does not own or replace these managed edges. No `concept_link`, concept co-occurrence or document-frequency projection is updated or automatically adopted by this flow.

## Boundaries and bounds

`GET /api/concept-associations/[kind]/[id]` accepts `person`, `artifact` and `concept`. It revalidates owner-session authorization before parsing input, and reads in a repeatable-read/read-only transaction with a read-only guard and a 15-second statement timeout. Inactive object history can be inspected; new decisions require active canonical endpoints.

Queries are strict: one optional relationship cursor, or a scoped history edge/cursor, with a separate literal label search/search cursor for Person/Artifact pages. Unknown, duplicate or incompatible parameters fail validation. Concept reverse pages do not accept a label-search request they would silently ignore. Search returns active canonical Concepts, preserves their category and makes no merge decision.

Writes use the existing private `POST /api/review` boundary, action `review_concept_association`: owner write permission, exact configured HTTPS Origin, bounded JSON, strict UUID/payload schemas and a nonblank reason of at most 2,000 UTF-16 units. Confirmation additionally validates the expected label/category. Labels beyond the current 300-unit review limit cannot be selected. Source labels and reasons render as text, with whitespace preserved and long content wrapped.

Readers page edges, search matches and history at 20 records each. Each edge's full support calculation is bounded at 200 managed assertions; exceeding it fails explicitly rather than truncating validity/history. Failed refreshes clear displayed results. Responses for another object are rejected; component keys reset state across objects, and object UUID casing is normalized.

## Validation

- All 363 phase 0–3 tests pass. Eight new cases cover frozen meaning, strict reasons/inputs, object kinds, cursor scope, the dedicated generic-review guard and owner/Origin/error boundaries.
- Application TypeScript and the production build/extension package pass.
- Focused Neon dev validation through `DIRECT_URL` passes 70 rollback-only SQL checks. It exercises actual Person/Artifact associations and reverse Concept inspection, literal label search, cross-kind rejection, stale meaning, exact reasons, replay/conflicts, all four generic bypass guards, independent subjects, no invented source mentions or legacy-link adoption, dependency/index-job invalidation, withdrawal and renewal, rename/reclassification retirement in inspection and ordinary recall, archival, rejected edges, relationship/search paging, full immutable proof-history paging and history scope isolation.
- Existing typed author/profile retrieval passes 46 rollback-only SQL regressions and memory queries pass 15. All 131 SQL checks pass with fixture rows rolled back and aggregate/relationship/support/Concept counts unchanged. No real notebook decision or job is processed.
- Actual source-review, panel and result components pass 109 isolated Chromium checks against synthetic APIs/data. New coverage includes explicit search/selection/review/cancel, exact reasons and expected meaning, frozen confirmation/withdrawal retries, reverse Concept inspection, withdrawal history, edge/history paging, read errors, inactive states and a narrow viewport. These are component checks, not deployed authenticated end-to-end tests.
- The production app passes 86 isolated HTTP checks using synthetic private settings and an unreachable fixture database. New checks cover signed-out/capture-secret rejection, authorization before malformed inputs, foreign-Origin rejection, read-endpoint method restrictions and denied unauthenticated writes.

No permanent database change, migration, real owner query/decision/capture/job, provider request, capture activation, historical backfill or deployment occurred. Capture remains disabled. Backup restoration verification remains deferred. Committed concurrency, production-volume performance, deployed HTTPS success and complete accessibility are not established by these checks.

## Next work

Extend typed retrieval to explicitly reviewed Concept associations, keeping owner interpretation distinct from source mentions and inferred concepts. New Concept creation, source-quoted `mentions_concept`, Organisation/employment/education relationships, reverse/multi-hop queries, identity/duplicate reconciliation, worker hosting, deployed integration, semantic calibration and reviewed historical backfill remain separate work.
