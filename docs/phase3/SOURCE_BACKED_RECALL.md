# Source-backed recall and resurfacing

Implemented locally on 2026-10-17. A successfully normalized v2 capture can now supply source-text evidence to recall and contextual resurfacing without a User note or resolved Person. Capture remains disabled; no schema migration, historical backfill, provider call or deployment was performed.

## Behavior and provenance

The shared retrieval reader reads immutable `snapshot_representation` text linked to the capture's Artifact and Encounter. Evidence is attached only to those two objects. A profile's text is not attributed to a Person through a URL, legacy projection, noticed link or assumed authorship. The source text creates no school, role, organisation or other structured Person facts.

Each piece of evidence has a deterministic representation/object ID, a source truth-layer label, the Snapshot and representation IDs, and Unicode code-point start/end offsets. `verified` here means an exact quotation of this captured representation; it does not establish external factual truth, publication date, authorship, source ownership or complete browser visibility. Safe recorded source URLs and internal captured-source inspection remain accessible from recall results.

The reader never searches mutable `artifact.body_text`. Different captures of the same Artifact retain independent evidence and Snapshot provenance, including an older capture completed after a newer one. A match describes saved source text, not necessarily the source's current external contents. Terms can be supported across multiple captures of the same Artifact; those captures are not collapsed into a new current factual assertion.

Street recall uses the existing conservative lexical matching. The Walk's contextual candidate reader receives the same eligible evidence, so saved-source words can support a context overlap without a User reason. This does not add semantic retrieval, inferred reasons or generated answers. User-word ranking remains reserved for actual User evidence.

Display excerpts and bounded future answer contexts preserve exact code-point ranges when shortening source quotations. Walk selection support retains representation/offset provenance alongside its evidence IDs, without duplicating captured text in session storage.

## Eligibility and withdrawal

The SQL reader requires all of the following in its existing consistent transaction:

- A v2 capture request with matching Snapshot and Encounter, a resolver-versioned Artifact, and an explicit Encounter `source` link to that Artifact.
- Active canonical Artifact and Encounter registry entries; archived or aliased objects do not supply this source evidence.
- A succeeded parse job matching the Snapshot's current processing head. Queued, leased, failed, superseded and quarantined jobs cannot supply source evidence.
- A representation matching the installed normalizer and capture kind.

The pure reader then recomputes the installed parse fingerprint from immutable source metadata and current identity-proof eligibility. A stale head, changed parser/normalizer version, or changed identity input cannot silently reuse old output. It also verifies the deterministic representation ID and exact text hash. Identity proof affects processing-version eligibility but never makes these source quotations Person facts.

An immutable representation alone is insufficient. It becomes eligible only after successful fenced processing. A new head can temporarily withdraw old evidence until valid work completes. Archive or removal of the explicit source link also withdraws source evidence. Existing observations and User notes retain their separate review/dependency rules.

This is a read-time evidence projection, not a new Observation or `text_evidence` row. Existing observation-level correction/rejection does not edit or reject an original captured quotation. Captured-content-specific review controls remain separate future work; originals remain immutable and source/Encounter archival supplies the existing withdrawal mechanism. Existing unversioned/legacy representations are not automatically adopted or backfilled.

Source rows have an explicit 50,000-row ceiling and fail instead of silently truncating the evidence population. Existing object/evidence limits and statement timeouts remain. Large-corpus latency and enabled production behavior remain unverified.

## Validation

- All 315 synthetic tests pass. Seven new cases cover no-note recall without Person attribution, stale version/head/hash/ID exclusion, identity-proof changes, separate capture versions, exact Unicode excerpt ranges, contextual resurfacing without User words, and unsafe source URL suppression.
- Application and extension TypeScript checks and the production build/package pass.
- `node scripts/database/validate.mjs --source-resolution-only` passes 60 rollback-only Neon dev assertions through `DIRECT_URL`. In addition to source resolution, these exercise the actual no-note capture/processor/reader path, a pre-existing representation while the job is pending, Artifact/Encounter recall, contextual selection, independent capture versions, current-head/job/archive/link withdrawals, exact quote offsets, and exclusion of invented mutable display text.
- The existing memory-query regression fixture passes 15 rollback-only assertions, including its real read-only transaction path and existing observation/review behavior.

All SQL fixtures rolled back and aggregate counts remained unchanged. The first expanded fixture run exposed a test-helper assumption about archived Artifacts still being present in the result set; the helper was corrected and the completed suite passed. No real capture, job, query, owner login, provider, permanent database write, migration, backfill or deployment occurred. Capture-v2 remains disabled. Prior installed-extension and HTTP checks were not rerun for this retrieval-focused slice.

## Remaining work

Reviewed source/Person reconciliation and supported typed relationships remain product gaps. Recurring worker hosting/readiness, deployed authenticated integration and latency verification, normal extension installation/update checks, and separately reviewed historical backfill remain rollout work. Semantic recall and calibrated retrieval quality still need their own implementation/evaluation. Backup restoration verification remains deferred at the user's request.
