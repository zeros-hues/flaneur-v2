# Reviewed relationship retrieval

Follow-up, 2026-10-18: [reviewed Concept associations](REVIEWED_CONCEPT_ASSOCIATIONS.md) now have explicit owner review, immutable reasons and Person/Artifact/Concept inspection. Typed retrieval for that new predicate remains separate from the author/profile filters documented below.

Implemented locally, 2026-10-18. Recall, resurfacing and the existing conservative reflection pipeline can now filter saved **Artifacts** by reviewed `authored_by` and `profile_of` relationships. No migration, backfill or automatic relationship creation is involved.

## Supported queries

- “Saved posts about botanical correspondence by Ada Lovelace” can combine topical terms with `authored_by: Ada Lovelace`.
- “Saved profiles of Ada Lovelace” can use `profile_of: Ada Lovelace` without topical terms.
- Several explicitly named authors can be combined as AND constraints, preserving independently reviewed co-authors.
- An explicit `person:UUID` written in the question can select one active saved Person when names are duplicated. The planner cannot invent that identifier.

These filters return Artifacts. A plan requesting Person or Encounter results with either filter produces clarification rather than silently changing its population. Reverse requests such as “people who wrote about robotics,” Organisation authors, other predicates and multi-hop traversal remain unsupported. The planner is instructed to clarify those requests; execution independently enforces the Artifact scope of the structured plan. This is not a new deterministic natural-language intent classifier.

## Planning and identity

The planner still receives only the question and reference instant, never notebook names, notes, source text or relationship rows. Its strict schema permits the two new constraint fields. Execution resolves a name by exact NFKC-normalized, case-insensitive equality among active canonical Persons. There is no substring/fuzzy matching, alias inference, URL inference or automatic Person creation.

When the request includes a question, the named identity must appear literally in it with Unicode word boundaries. A substituted saved name, an embedded substring such as “Ada” in “Canada,” or an invented UUID cannot silently change the target. UUID selection always requires its explicit `person:UUID` mention. Missing names, duplicate names and unavailable identifiers become visible clarification questions; they do not become provider guesses, arbitrary first matches or generic database-error responses.

## Read and matching rules

The existing repeatable-read, read-only retrieval transaction reads current relationship support alongside the ordinary evidence population. No helper opens a separate snapshot or writes to storage.

Only deterministic managed edges can satisfy a relationship filter:

- `authored_by` requires an active managed edge and a current per-capture User decision accepted by the same checks as authorship source review and the Person/Artifact panels. Repeated captures can preserve support after one withdrawal. Co-authors remain independent.
- `profile_of` requires the existing profile edge view to report supported: current owner identity proof, eligible capture/source/Encounter links and matching relationship support. Conflicting captured identities, even with raw active flags, cannot qualify. A profile association never substitutes for authorship.

Candidates, rejected edges, inactive or superseded decisions, reviewed withdrawals, archived/aliased objects, unlinked captures and unmanaged legacy associations cannot supply these filters. Requested relationship fields are declared fully evaluated within the bounded reviewed population. Missing reviewed support excludes the Artifact rather than presenting it as an uncertain identity match. This does not prove that an unreviewed author relationship is false in the external world.

Topical matching continues to use the Artifact's existing eligible evidence: immutable captured-source text after successful current processing, or preserved User words, for example. The added relationship context is `filterOnly`: it may satisfy its typed filter but cannot supply a missing topical term. Person biographies and unrelated Person facts are not copied into Artifact recall. Artifact-level relationships do not establish authorship of a particular historical text version, publication dates or verified encounter clocks.

Each matching edge contributes one deterministic representative current User decision, with relationship, Person, Observation, Snapshot and Encounter identifiers. Other support remains inspectable through the existing panels/source history. Current relationships are revalidated on every read; neither a stored active flag nor a previous result is sufficient.

## Results and limits

Results label relationship evidence **Your reviewed authorship decision** or **Your reviewed profile association**, explicitly qualified as not independently verified. Related Person, captured-source and Encounter links preserve the review path. Relationship support is retained ahead of the ordinary six display excerpts, so several topical hits cannot hide the reason the typed filter matched.

The existing evidence contract treats a recorded User decision as verified User words; that flag is not external author/ownership verification. Relationship provenance and `filterOnly` survive answer-context construction, and answer instructions retain this qualification. No generated-answer provider is enabled or called by this work.

Existing limits remain: 5,000 candidate objects, bounded evidence/dependencies, 200 authorship assertions per Artifact and 1,000 profile proof/support rows per Artifact. Relationship resolution additionally bounds active canonical Persons and matching managed edges at 5,000 each. Exceeding a bound fails explicitly instead of silently truncating identities, support or results. Reflection retains its existing complete-population/index-coverage requirements; this slice adds no new trajectory, aggregation or population inference.

## Validation

- All 355 phase 0–3 tests pass, including nine new cases for scope, exact/duplicate names, explicit identifiers, literal identity mentions, filter-only topical separation, missing support, answer provenance, clarification routing and visible evidence ordering.
- Application TypeScript and the production build/extension package pass.
- Focused Neon dev validation through `DIRECT_URL` passes 46 rollback-only SQL checks; existing memory-query regressions pass another 15. The focused fixture runs actual synthetic captures, fenced source processing, author/profile decisions and the memory pipeline with a fixture planner. It checks source-plus-relationship citations, exact support identifiers, unreviewed/candidate/withdrawn/archived support, co-authors, repeated captures, ambiguous/missing/substituted names, explicit UUIDs, Artifact-only scope, conflicting profile proofs and no inferred authorship. All fixtures roll back and aggregate/relationship/support/Artifact counts stay unchanged. Only fixture jobs are processed.
- Actual source-review/panel/result components pass 85 isolated Chromium checks with synthetic APIs/data, including the new relationship labels and Person/Snapshot links. These are component browser checks, not a deployed or real-provider natural-language query test.
- The production app passes the existing 67 isolated private-source/authorship HTTP regressions with synthetic configuration and an unreachable fixture database. No HTTP endpoint or owner authorization policy changed in this slice.

No permanent database change, migration, real owner query/decision/capture/job, provider request, capture activation, historical backfill or deployment occurred. Capture remains disabled. Backup restoration verification remains deferred. Committed concurrency, production-volume performance, deployed authenticated queries, live planner quality and semantic recall calibration are not established by these checks.

## Next work

Add evidence and review policies for further relationships, then extend retrieval only to those supported predicates. Reverse Person/Encounter queries, Organisation authors, duplicate/source reconciliation, ambiguous/rejected identity resolution, worker hosting, deployed integration, semantic calibration and reviewed historical backfill remain open.
