# Reviewed directed trajectory

Completed locally, 2026-10-19. This follows the approved Observation-based proposal and the requested distinction between explicit transitions, unconfirmed chronology candidates and mere co-occurrence. It extends the current retrieval and review paths; education/employment, Concept, author and profile implementations are retained.

## Representation

A trajectory is an immutable `relationship_assertion` Observation **on a Person**, with `field_key = reviewed_trajectory`, `support_status = partial`, a deterministic `explicit-trajectory-v1:<requestId>` origin, and structured `{version, request}` data. It is not another static graph edge or a new generic timeline entity. Existing `similar_trajectory` rows cannot supply it.

The strict request records:

- `personId`, stable `requestId`, decision and exact reason.
- `from` and `to`: distinct saved Concept UUIDs, frozen labels and `concept`/`topic` categories. These can describe disciplines, domains or states; no new ontology, fuzzy mapping or automatic Concept creation occurs.
- `supportingObservationIds`: up to 12 distinct current evidence references on that same Person, with matching `observation_evidence` support rows.
- Optional `chronology`: origin/destination periods, each with nullable `start`, nullable `end` and explicit `ongoing` flag. Dates remain `YYYY`, `YYYY-MM` or `YYYY-MM-DD` strings; their precision is not discarded.
- A candidate ID for confirmation, or an old Observation ID for correction. Supersession and immutable reviews preserve the decision lineage.

Both endpoints are matched on **one current claim**. Two separate assertions, A→C plus D→B, cannot supply A→B. Education in A plus a Concept association with B also cannot supply it.

## Trust and candidate behavior

An explicit owner confirmation stores a **User** Observation with the exact authored reason. An independent owner statement can have no external attachment: the User assertion is its evidence, and the UI explicitly says it is not independently verified. Optional recorded periods are likewise owner assertions, not verified external event times.

Attachments must pass the existing current-evidence reader: same Person subject, current active canonical support, verified User/Source/Extracted evidence, and existing source locator/current derivation checks where applicable. Inferred, cross-Person, Encounter-only, Artifact-only or missing observations cannot be borrowed. No Person fact propagates through a profile, author, Organisation or Concept relationship.

An owner may opt in to a **chronology candidate** using two or more current supporting Person observations and recorded periods. The deterministic candidate rule requires the relevant endpoint labels and supplied date strings to occur in the cited evidence. It generates an **Inferred**, unconfirmed “possible path” Observation. Its rationale remains explicitly labelled User input; the rule/version and supporting IDs are retained. This is a conservative literal input check, not proof of career-event meaning or a move. Unknown/overlapping chronology remains visibly uncertain. No calibrated confidence number is invented.

There is no automatic candidate scan, source extractor, model call or historical role/education conversion. Candidate creation is an explicit owner request. A candidate, even with clean chronological order, never satisfies trajectory Recall. Confirming it requires a new explicit owner reason asserting the move; the writer appends a **User** revision and a `confirmed` review pointing to that revision. The original remains Inferred. Inputs and periods are frozen across that review; changing them requires correction/new review rather than silently accepting different evidence.

Captured Source/Extracted attachments retain their own layer and inspectable locators. This slice does not introduce a direct Source-labelled transition producer or pretend an owner confirmation is source verification.

## Review and history

The existing owner/origin-protected `POST /api/review` accepts `review_trajectory` and dispatches to the supplied application pool. Stable request IDs, canonical payload receipts and the existing dependency transaction provide atomic writes and retries. Changed ID reuse fails; an old replay does not undo a later correction or withdrawal. No extraction jobs are enqueued.

Supported actions:

| Action | Stored outcome |
| --- | --- |
| Confirm explicit transition | Immutable User assertion |
| Propose chronology candidate | Inferred assertion, unconfirmed and excluded from trajectory Recall |
| Confirm candidate | User revision superseding candidate, immutable confirmed review |
| Correct confirmed transition | User revision superseding original, immutable corrected review |
| Reject / withdraw | Immutable rejected review; original text and support retained |
| Archive | Rejected review plus Observation archival; data retained |

Generic observation actions route managed trajectory assertions to this dedicated panel. Read eligibility independently checks namespace/UUID, strict request, exact body, truth layer, version, revision target, active canonical Person and frozen Concept meanings, reviews/successors, exact support links and currently eligible evidence. A raw stored record is not trusted merely because it exists. Missing, rejected, superseded, inactive, mismatched or ambiguous support cannot satisfy Recall.

The small Person panel supports existing-Concept selection, frozen previews, exact reason preservation, support IDs, optional periods, safe lost-ack retry, candidate review, correction, withdrawal and archive. History includes original and replacement IDs, reasons, recording/review times, derivation, original periods, retained support IDs and currently available evidence/source/Encounter links. Recording time is not presented as event time. Read failures clear the stale view; conflicts require refresh.

`GET /api/trajectory/[id]` is owner-protected, private and read-only, with auth before parameter parsing and strict search/history cursors. Inspection uses a checked repeatable-read read-only transaction. All history stays scoped to that Person. There are 20 items per page, at most 200 managed assertions/reviews per bounded history, and explicit failure rather than successful truncation. Concept catalogues and trajectory Person populations are bounded at 5,000. These are staging safeguards, not measured production capacity.

## Chronology

Exact dates are validated, including leap days. Month/year values become **bounds for comparison**, without changing stored precision. Invalid periods, an end on an explicitly open-ended period, duplicate endpoints and completely reversed origin/destination periods are rejected.

- `ordered`: latest possible origin end precedes earliest possible destination start.
- `overlapping_or_uncertain`: complete recorded periods overlap, or coarse precision prevents strict order.
- `unknown`: absent/partial/open-ended data cannot establish that order.

An explicit User transition can remain supported with unknown or overlapping periods, because the explicit assertion supplies the direction; the dates do not independently prove it. A chronology candidate remains unconfirmed regardless of order. Missing end dates do not mean ongoing unless explicitly marked. No graduation, employment status, causal motive, abandonment of a discipline or event date is invented.

## Retrieval and Street

The planner's optional strict `trajectory: {from, to}` becomes one compound constraint in the existing evidence pipeline. `from` can be null only for an explicitly destination-only transition question. The reader resolves both identities using the existing exact Concept resolver, matches one current owner-reviewed claim and supplies filter-only User evidence with frozen endpoints, chronology, support references and candidate lineage. A destination-only result still displays its actual recorded origin; none is invented.

The supported English transition grammar covers moved/transitioned/went/shifted/changed/switched **from A into/to B**, and destination-only **into B**. Planning and execution both enforce endpoint direction and exact endpoint clauses. A label in a subsequent AND filter cannot substitute for a transition endpoint. Missing trajectory plans clarify before A+B retrieval. Negated/multi-step requests clarify. Complex endpoint labels containing clause punctuation/conjunctions may require explicit `concept:UUID` identifiers rather than natural-label phrasing. This is a conservative grammar guard, not a complete natural-language intent classifier.

Only active canonical exact saved Concepts resolve; duplicates across categories require clarification and literal `concept:UUID` disambiguation. There is no semantic-similarity trajectory, alias guess or topic promotion.

Trajectory returns People and composes as an AND filter with direct Person education, employment, study-field and reviewed Concept associations. It rejects Artifact/Encounter scope and author/profile traversal. Existing Artifact-scoped author/profile/Concept queries remain supported. Relative ordering against an education/employment predicate, such as “studied at EPFL and later moved”, clarifies: the current career predicates have no reviewed episode dates that establish that order.

Street retains its existing result grammar. It shows the Person, A→B, exact reason, owner-review qualification, known/unknown chronology and a link to trajectory evidence/decision history. Supporting observations are included alongside the matched claim and keep their own truth layers/source provenance. Answer context preserves direction and metadata; no answer generator is enabled or called.

## Validation

All **394 phase 0–3 tests** pass, including 14 focused trajectory contract/intent tests. Clean TypeScript and the production build/extension package pass. Neon dev validation passes **246 rollback-only SQL checks**: 76 trajectory, 55 education/employment, 54 reviewed Concept, 46 author/profile and 15 ordinary memory checks. Aggregate counts remain unchanged. Actual component browser validation passes **161 checks**, and built-app HTTP validation passes **106 checks**.

The trajectory suite covers explicit matching, reverse direction, co-occurrence exclusion, candidate review, malformed immutable claims, cross-Person evidence, missing support links, current evidence withdrawal, exact name ambiguity/UUIDs, chronology uncertainty, composition, correction/replay, withdrawal/archive, supersession and inactive/changed meanings.

Existing education/employment, reviewed Concept, author/profile and memory SQL regressions are retained. The actual component browser suite checks selection/preview before writes, unchanged retry payloads, correction and candidate decision history, source/Encounter evidence inspection, trust labels and stale-read clearing. Built-app HTTP checks use synthetic session configuration and an unreachable fixture database; they check private auth/origin/method boundaries without a real login.

All administrative validation uses `DIRECT_URL` with synthetic outer transactions that deliberately roll back. Aggregate snapshots include evidence/operational tables, Concepts, Organisations, education, roles, relationships and support. No credentials, private rows, real owner actions, real capture/processing jobs, provider requests or raw driver errors are printed.

## Files changed in this slice

Added:

- `lib/relationships/trajectory.ts`, `trajectory-store.ts`, `trajectory-reader.ts`.
- `lib/retrieval/trajectory-intent.ts`, `postgres-trajectory.ts`.
- `components/inspection/TrajectoryRelationships.tsx`, `TrajectoryChronology.tsx`.
- `app/api/trajectory/[id]/route.ts`.
- `scripts/phase3/trajectory.test.mjs`, `scripts/database/validate-trajectory.ts`.
- This implementation/readiness report.

Extended:

- `lib/retrieval/{planner,relationship-filters,postgres-relationships,postgres-reader,evidence,answer}.ts` and `lib/query/memory.ts`.
- `lib/review/{handler,postgres-dependencies}.ts` and `lib/processing/postgres-dependencies.ts`.
- `app/person/[id]/page.tsx`, `components/query/MemoryBlock.tsx`, `components/person/ObservationInspector.tsx`.
- Both source-identity browser/HTTP validators and database validation entry points.
- `MIGRATION_PLAN.md`, `DATA_MODEL_V2.md`, Phase 3 status and the historical proposal's follow-up note.

Previously uncommitted career/Concept work was preserved. No migrations, schema/table changes, dependency upgrades or credential edits were added. No permanent database changes were applied. Capture activation, backfill, deployment, production worker hosting, Correspondence and broad Reflect/pattern implementation did not occur. Backup restoration verification remains deferred.

## Product readiness assessment — no additional implementation

These ratings describe the local code's product behavior, not a deployed or live-provider acceptance run. Phase 3 remains incomplete.

| Product test | Rating | What works | What remains |
| --- | --- | --- | --- |
| EPFL: “Who have I saved who studied at EPFL and later moved from mechanical engineering into AI?” | **PARTIALLY READY** | Reviewed school plus explicit directed transition can compose, with exact identities/evidence and no A+B substitution. | The word “later” asserts ordering relative to education. Current school assertions have no reviewed episode dates to establish that relation, so this exact query clarifies. Supported education episode dates/order evidence are still needed. The school and transition must also have current reviewed records and resolvable saved identities; no historical backfill or automatic trajectory extraction supplies them. Live planner/deployed acceptance remains unverified. Removing the unsupported ordering yields a supported conjunction, not proof of “later”. |
| 3D: “I’m working on a performant 3D interaction website. What have I encountered before that might help?” | **PARTIALLY READY** | Current immutable source text and User observations can provide finite saved Person/Artifact/Encounter matches with provenance; explicit Concept/career filters can narrow recall. | Retrieval is still conservative lexical coverage, not calibrated semantic relevance to a project. Missing/unprocessed captures, vocabulary mismatch, planner interpretation, context-aware ranking, useful diversity and practical live-corpus evaluation remain. The live route displays evidence without generated answer synthesis. Trajectory adds no general technical recommendation or external research capability. |
| Pattern: “What patterns do you see among the people I keep saving?” | **NOT READY** | Observations, Encounters, explicit relationships and finite evidence inspection provide future inputs; existing reflection contracts can abstain on inadequate coverage. | There is no implemented evidence-backed corpus-level pattern discovery, repeated-attention analysis, trajectory aggregation, complete-population synthesis/evaluation or useful pattern presentation. Independent facts and small retrieved sets must not be presented as population patterns. This task did not implement Reflect or Correspondence. |

Other limits: existing Concepts must be selected explicitly; there is no automatic episode reconstruction, broad timeline engine, arbitrary multi-step path query, event-date filtering or inferred-candidate Recall. Source/identity-dependent support is rechecked through the existing reader, but live source extraction for new trajectory claims, committed concurrency, production-volume performance and provider planning quality were not established by these fixtures. The bounded reader currently performs repeated support checks; it must be measured before a large-corpus rollout.

**Stop point:** this trajectory slice ends here. No subsequent Phase 3 task is started by this report.
