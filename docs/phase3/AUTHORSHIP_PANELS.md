# Person and Artifact authorship panels

Follow-up, 2026-10-18: [typed relationship retrieval](TYPED_RELATIONSHIP_RETRIEVAL.md) now filters saved Artifacts by reviewed authorship/profile links using these current-support rules. The original implementation and validation record below are retained.

Implemented locally, 2026-10-18. Person pages now provide **Reviewed authored works** and Artifact pages provide **Reviewed authors**. Both use the explicit post-authorship decisions described in [reviewed post authorship](REVIEWED_POST_AUTHORSHIP.md). No schema or writer change is required.

## Behavior

Panels load only when the owner chooses **inspect authorship relationships**. Opening, refreshing and paging are read-only operations. Each edge links the Artifact and Person, identifies its effective status, reports the full number of current owner decisions, and displays exact reasons and withdrawal reasons with capture/Encounter links.

The same current-support function as source review checks active canonical sources, captured Encounters, explicit capture/source links, Persons, assertions, reviews and supersession. Multiple captures can support one author; co-authors retain separate edges. Withdrawn support remains historical. A raw active flag cannot establish current authorship, and a rejected edge reports zero current support. Candidate support is labelled without claiming an active relationship. Legacy Person fields and unmanaged relationship endpoints are not adopted.

The panels do not offer a second mutation path. Owners follow an individual capture to confirm or withdraw a decision using the existing protected source-review flow. No Person facts, identity decisions, Encounter Person links, parse jobs or author inferences are created by inspection.

## Boundary and bounds

`GET /api/authorship/[kind]/[id]` accepts only `person` and `artifact`, UUID targets, and one optional UUID `cursor`. Unknown/duplicate parameters fail validation. Owner-session authorization precedes input parsing, and responses are private/no-store with `nosniff`. Other HTTP methods cannot mutate this endpoint. Driver errors remain private.

The reader opens a repeatable-read, read-only transaction with a 15-second statement timeout and checks the read-only setting. It validates deterministic managed edge IDs, pages edges by UUID at 20 per response, and reuses assertions for shared Artifacts within a page. An unknown object returns no page; inactive object history can remain visible but cannot supply current support.

Each edge displays at most 20 decisions, with the complete history and current-support counts. If more exist, the panel explicitly reports the limit and links to the Artifact's original captures/source review. The existing 200-assertion cap per Artifact remains: exceeding it fails explicitly rather than returning incomplete validity calculations. Large-population performance and deeper history pagination are future work.

A failed refresh clears old results. Responses for another kind or object ID are rejected. A component key resets state on navigation to another Person or Artifact, including when an earlier request is still in flight.

## Validation

- All 346 phase 0–3 tests pass. Two new cases cover strict target and cursor/filter validation. Application TypeScript and the production build/extension package pass.
- Focused Neon dev validation through `DIRECT_URL` passes 92 rollback-only SQL checks. The expanded fixture covers Person/Artifact parity, repeated-capture support, co-authors, withdrawal reasons and retained history, archived sources/Persons, rejected edges, ignored legacy endpoints, complete UUID paging, malformed managed IDs and actual read-only wrappers. Existing authorship write/replay/dependency/worker-fencing checks remain included. Fixtures roll back and aggregate/relationship/support/Artifact counts remain unchanged.
- Actual source-review and relationship components pass 78 isolated Chromium checks with synthetic APIs. Panel coverage includes explicit reads, both kinds, current/candidate/historical/rejected labels, reasons, capture/Encounter links, bounded-history notices, pagination, error clearing, mismatched-object responses, no review writes and a narrow viewport.
- The built app passes 67 isolated HTTP checks with synthetic private configuration and an unreachable fixture database. Panel coverage confirms signed-out/capture-secret rejection, authorization before malformed input parsing, foreign-Origin rejection and method restriction.

One SQL validation attempt lost its connection. Aggregate diagnostics then showed zero graph-lock holders/waiters and no idle transaction holders; no session was terminated. A retry reached the pagination fixture and exposed omitted required source URLs in its synthetic Artifacts. Those fixture inserts were corrected. The validator retains its transaction-local idle timeout and now reports finer-grained stage labels without private row, query or credential output.

No permanent database change, migration, real owner decision/capture/job, provider request, activation, historical backfill or deployment occurred. Capture-v2 remains disabled. Backup restoration verification remains deferred. These checks do not establish deployed authenticated HTTPS success, committed concurrency, production-volume performance or complete accessibility.

## Remaining work

Typed relationship retrieval, Organisation authors, other adapters and predicates, duplicate/source reconciliation and ambiguous/rejected profile-identity resolution remain separate work. Worker hosting, deployed capture integration, semantic recall calibration and reviewed historical backfill are still open.
