# Reviewed education and employment

Implemented locally, 2026-10-18. This extends the existing reviewed relationship and evidence retrieval path. The completed Concept, author and profile policies remain in place. No schema migration is needed or applied.

## Product behavior

The Person page now has a small education/employment inspection and review panel. The owner searches existing Organisations, explicitly selects an identifier, chooses “Studied at” or “Worked at”, and records an exact supporting reason. An education statement may include an exact field of study. The owner reviews the frozen target, field and reason before submitting. Confirmations and withdrawals have stable request IDs; lost acknowledgements retry the same payload. A withdrawal addresses one exact Observation, preserves its reason, and cannot silently affect another statement.

The existing predicates are reused:

| Representation | Meaning | Does not establish |
| --- | --- | --- |
| Person → `educated_at` → Organisation | Owner-reviewed assertion that the Person studied there | Graduation, degree, attendance dates or current attendance |
| Person → `employed_by` → Organisation | Owner-reviewed assertion that the Person worked there | Present employment, role/title, employment dates or a transition |
| Education assertion's `fieldOfStudy` | Exact discipline the owner reviewed as part of that education statement | General expertise, a Concept association or a later career field |

`field_of_study` is a retrieval constraint over the education assertion, not a new graph predicate or entity. Its wording follows the existing education model. A general `associated_with_concept` assertion cannot establish that someone studied a discipline.

The legacy `education.field_of_study`, school strings and role/Organisation projections remain preserved. They are not copied into reviewed claims or trusted merely because they exist. This writer does not populate mutable legacy projections: the immutable V2 assertion is the review record. Existing extracted-field retrieval remains separate. There is no automatic Org creation, aliasing, historical adoption, extraction, identity assignment or backfill.

## Review, evidence and invalidation

Confirmations append a User-layer, partial-support `relationship_assertion` Observation on the Person, with `reviewed_career` field key and the strict request in structured data. This records the owner's assertion and evidence/reason in their words; it is **not** an independently verified Source assertion. It does not fabricate a Snapshot, source quote, Encounter, Extracted claim or Inference.

The existing `relationship` and `relationship_support` tables connect the typed Person/Organisation pair to that Observation. Namespaces are `reviewed-career-v1:<predicate>:<person>:<organisation>` for edges and `reviewed-career-decision-v1:<request>` for decisions. Deterministic IDs, exact stored reasons, full request identity, subject/target/predicate agreement, truth layer, semantic role and support status are all revalidated. Legacy collisions and rejected edges are not adopted. There is one current reviewed statement per predicate/Organisation pair; correcting its field requires withdrawal and a new confirmation.

The existing dependency transaction locks affected processing scopes before the graph lock. Decision, support, review, invalidation and materialized state commit together. Withdrawal appends an immutable rejected review; old confirmation replays cannot reactivate it. Changed request-ID reuse fails. Both endpoints must be active and canonical for a new decision. No jobs are enqueued or providers invoked.

Current readers exclude archived/aliased endpoints or proofs, any reviewed or superseded proof, missing/mismatched support, and non-active or rejected edges. The exact Organisation label is frozen at confirmation; a later rename invalidates current support until reviewed again. Generic observation review/archive controls route these managed assertions back to the dedicated panel. Ordinary evidence/dependency reads also retire proofs whose Organisation meaning is unavailable or changed.

The private read-only panel provides exact confirmation reasons, field and Organisation meaning at decision, withdrawal reasons, statement IDs and review state. Edges, search and decision histories have separate scoped UUID cursors. History queries cannot inspect another Person's edges. Limits fail explicitly: 5,000 active Organisation identities, 5,000 managed career edges and 200 support records per edge. UI pages contain 20 records. These are staging bounds, not measured production capacity.

## Retrieval

The strict planner and existing read-only transaction support:

- `educated_at: EPFL` — People with current reviewed education support for the exact active Organisation.
- `field_of_study: Mechanical engineering` — People with that exact normalized field in a current reviewed education statement.
- `employed_by: IDEO` — People with current reviewed employment support.
- AND combinations of those filters and a direct Person `associated_with_concept: AI` filter.
- Existing Artifact-scoped author/profile plus Artifact Concept queries, unchanged.

Organisation identities resolve by exact NFKC-normalized, case-insensitive saved name. Duplicate or missing active names require clarification. A literal `organisation:UUID` in the question disambiguates; the planner cannot substitute an inferred identifier or name. Study fields are exact owner-authored terms, not Concept identities; there is no fuzzy discipline matching, expansion or synonym mapping.

Career filters default to People. Explicit Artifact/Encounter populations, or combinations with Artifact-only `authored_by`/`profile_of`, clarify instead of manufacturing a Person fact or silently changing scope. No author/profile/Organisation/Artifact Concept relationship propagates to a Person. These are direct predicates, not reverse or multi-hop traversal.

Matching evidence is filter-only User context carrying the Person result, exact Observation, edge, Organisation ID/frozen label, predicate and optional study field. Results explicitly qualify owner review, display what matched, and link to the Person's dedicated decision-history section. Answer context preserves that metadata and its trust qualification. No external provenance link is invented.

Within the bounded reviewed population, requested career fields are fully evaluated: absence of current reviewed support excludes a match. This is not a claim that the Person lacks that education or employment in the outside world. AND filters may match distinct education/employment statements on the same Person; they do not assert one episode, simultaneous activity, ordering or a transition.

## Validation

All 380 phase 0–3 tests pass, including nine new career contract cases. Clean TypeScript and the production build/extension package pass. Neon dev validation passes 55 focused career checks plus 46 author/profile, 54 reviewed Concept and 15 ordinary memory checks: **170 rollback-only SQL checks**. Actual component browser validation passes **134 checks**; built-app HTTP validation passes **96 checks**.

All database checks use synthetic rows inside an outer transaction that deliberately rolls back; count snapshots include existing evidence/operational tables plus Organisations, education, roles and relationship support. Counts stayed unchanged. Administrative SQL uses `DIRECT_URL` without emitting credentials or private rows. No migration or permanent data/schema change was applied.

The focused fixture covers positive school/employer/field retrieval, combinations, Concept composition, Person scope, legacy projection exclusion, duplicate names and literal UUIDs, exact reason/provenance, candidate/rejected/withdrawn/missing/mismatched/superseded/archived support, changed Organisation meaning, review routing, replay conflicts and an old replay's inability to revive a withdrawal. Existing author/profile, reviewed Concept and ordinary memory SQL suites are retained as regressions.

The browser fixture runs actual React review/result components in Chromium with synthetic APIs: selection, preview before write, exact reason/field capture, stable lost-ack retries, exact-proof withdrawal, history links, trust labels and stale-view clearing. Built-app HTTP checks use synthetic auth configuration and an unreachable fixture database; they check signed-out/capture-secret rejection, auth before malformed query parsing, cross-origin rejection and unsupported methods.

## Limits and Phase 3 status

Recording an education field currently requires a known saved school Organisation. A field-only education history with no known institution is not invented; support for that would need a separate reviewed education-record policy. Existing Organisation creation/reconciliation and synonyms remain outside this slice. Dates, roles, degrees, current employment, same-episode joins, inferred/Source-derived career assertions and trajectory reasoning are not implemented here.

Natural-language planning still uses the existing question-only provider contract. The prompt requests the new filters and clarification for unsupported temporal/trajectory intent; fixture planners validate execution, not live provider faithfulness. A provider can still misinterpret a question. Production planner evaluation, semantic calibration, committed contention, large-corpus performance, deployed authenticated flows and worker rollout remain unverified.

Phase 3 advances through direct reviewed education/employment and study-field retrieval but remains incomplete. Capture activation, historical backfill, production hosting, deployment, Correspondence and Reflect/pattern implementation did not occur. Backup restoration verification remains deferred. The next trajectory slice is **design only**, requires approval, and is described in [the trajectory proposal](TRAJECTORY_PROPOSAL.md).

## Files changed for this slice

- Added `lib/relationships/career.ts`, `career-reader.ts` and `lib/retrieval/postgres-career.ts`.
- Added `components/inspection/CareerRelationships.tsx` and `app/api/career/[id]/route.ts`; integrated the panel in `app/person/[id]/page.tsx`.
- Extended `lib/retrieval/{relationship-filters,postgres-relationships,planner,evidence,answer,postgres-reader}.ts` and `components/query/MemoryBlock.tsx`.
- Extended `lib/processing/postgres-dependencies.ts`, `lib/review/{handler,postgres-dependencies}.ts` and `components/person/ObservationInspector.tsx` for managed review routing and stale-target invalidation.
- Added `scripts/phase3/career.test.mjs`, `scripts/database/validate-career.ts`; extended the database validation entry points and both source-identity browser/HTTP validators.
- Updated this report, Phase 3 status, `MIGRATION_PLAN.md` and `DATA_MODEL_V2.md`; added the separate trajectory proposal.

Previously unfinished or uncommitted Concept changes were retained. No migration, dependency/version change, credential edit or permanent database change belongs to this slice.
