# Reviewed Concept retrieval

Implemented locally, 2026-10-18. The existing memory pipeline now supports `associated_with_concept` filters over the explicit owner decisions introduced in [reviewed Concept associations](REVIEWED_CONCEPT_ASSOCIATIONS.md). No schema or writer change is needed.

## Query meaning and populations

Queries such as “people I associated with Correspondence” or “saved Artifacts I associated with Fieldwork” can select a reviewed Concept association. This is an owner interpretation, not a source mention, hashtag, inferred topic or expertise claim. Broad topical queries such as “about robotics” are not automatically rewritten as reviewed Concept filters.

| Requested filters | Supported result population |
| --- | --- |
| Reviewed Concept association only | Explicit Person, Artifact, or both; defaults to both when unspecified |
| Author/profile plus Concept association | Artifacts only |
| Concept filters requesting Encounters | Clarification |

Multiple Concepts and author/Concept combinations are AND filters on the same object. A work's association never propagates to its author or profile owner. Reverse/multi-hop traversal, Organisation results and source-quoted `mentions_concept` remain unsupported. As before, planner instructions constrain interpretation of natural language; execution independently enforces the structured plan's supported object kinds rather than acting as a deterministic natural-language classifier.

## Identity and current support

The planner receives only the question and reference instant. It does not receive the Concept catalogue, notebook text or relationship rows. Execution resolves labels by exact NFKC-normalized, case-insensitive equality among active canonical Concepts. Duplicate labels remain ambiguous even across stored categories. Missing, substituted or ambiguous labels produce visible clarification instead of guessed identities or a generic outage.

An explicit `concept:UUID` can disambiguate only if that literal identifier appears in the question. A supplied label must also appear literally in a supplied question, with Unicode word boundaries. There is no fuzzy match, alias resolution, category-based guessing or merge.

Within the same repeatable-read/read-only snapshot as ordinary retrieval, matching requires an active deterministic managed `associated_with_concept` edge and a current User decision accepted by `conceptAssociationProofs`. That helper rechecks canonical endpoints/proofs, review/supersession state, exact reason/provenance and the frozen Concept label/category. Candidate, rejected, withdrawn, renamed, reclassified, archived or aliased support cannot satisfy the filter. Legacy `concept_link` rows and inferred/hashtag associations are not adopted.

Requested reviewed-association fields are fully evaluated within the bounded population. Missing reviewed support excludes the object instead of producing an uncertain identity match. This does not establish that an unreviewed external association is false.

## Evidence and presentation

Each qualifying edge contributes one representative current User reason with its Relationship, Observation and Concept IDs, plus the label/category reviewed at the decision. It is `filterOnly`: relationship context and label metadata cannot supply a missing topical term. Ordinary eligible text or User words on that same object must satisfy topical terms. Person biographies, Concept descriptions and authors' associations are not transferred between objects.

Evidence remains labelled User words; the existing verified flag authenticates the recorded decision, not an external factual claim. Answer-context serialization preserves the Concept-specific provenance separately from Person-targeting author/profile provenance. Instructions keep owner interpretations distinct from model-generated inference. No generated-answer provider is enabled or called.

Results say **Your reviewed Concept association — interpretation, not a source mention**, show the Concept's reviewed label/category, and link to the Concept and the exact subject's reviewed-relationship history section. No Snapshot/Encounter citation is fabricated for an object-level interpretation. Existing author/profile capture citations remain unchanged. Result composition retains relationship support ahead of ordinary excerpts.

## Bounds and validation

The existing 5,000-candidate/evidence/dependency limits and 200-assertion Concept-edge bound remain. Active canonical Concept identity resolution and matching managed Concept edges are additionally capped at 5,000 each. Author/profile limits remain independent; combined relationship evidence is capped at 5,000. Bounds fail explicitly rather than silently truncating identity choices, validity or results. Reflection retains its existing complete-population/index-coverage requirements; no new statistics, semantic thresholds or trajectory inference are introduced.

- All 371 phase 0–3 tests pass. Eight new cases cover population rules, mixed filters, exact/duplicate labels, explicit identifiers, literal identity mentions, filter-only matching, answer provenance and clarification routing.
- A clean TypeScript check (`--incremental false`) and production build/extension package pass.
- Neon dev validation through `DIRECT_URL` passes 54 focused rollback-only SQL checks, plus 46 author/profile retrieval and 15 memory-query regressions: 115 total. The focused fixture uses actual capture/author/Concept services and the memory pipeline with a fixture planner. It covers Person/Artifact scope, no legacy-link adoption, no author-to-Concept propagation, exact decision provenance, topical separation, combined author/Concept and multiple-Concept filters, missing/duplicate/substituted identities, explicit UUIDs, unsupported scope, candidate/withdrawn support, rename/reclassification, archived subjects/Concepts and rejected edges. Fixture rows roll back and aggregate/relationship/support/Concept counts remain unchanged. No real query or job is submitted.
- Actual source-review/panel/result components pass 117 isolated Chromium checks using synthetic APIs/data. New coverage verifies interpretation labels, both result kinds, Concept links, exact history anchors, frozen category/label display and absence of invented capture links.
- The production app passes the existing 86 isolated private-source/relationship HTTP regressions with synthetic private configuration and an unreachable fixture database. No HTTP endpoint or authorization policy changed.

On resume, missing `node_modules` prevented initial validation; locked dependencies were restored with `npm ci`, leaving `package-lock.json` unchanged. A synthetic note fixture needed explicit Observation UUIDs. The full build also caught an older validation fixture assuming every relationship targeted a Person; it now narrows the provenance by predicate. Final checks above pass after those corrections.

No permanent database change, migration, real owner query/decision/capture/job, AI provider request, activation, historical backfill or deployment occurred. Capture remains disabled and backup restoration verification remains deferred. Deployed authenticated queries, live planner quality, committed concurrency, production-volume performance and semantic calibration remain unverified.

## Remaining work

Source-quoted Concept mentions and other supported relationship policies, Organisation/employment/education associations, new Concept creation, reverse/multi-hop retrieval, identity/source reconciliation, recurring worker hosting, deployed integration, semantic calibration and reviewed historical backfill remain separate work.
