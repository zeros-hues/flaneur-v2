# Review a captured profile before associating a Person

Follow-up, 2026-10-18: [reviewed reassignment](IDENTITY_REASSIGNMENT.md) now handles a sole active current confirmed association with explicit replacement selection and a retained reason. Conflicting or already-rejected histories still require separate reconciliation. The earlier implementation record below predates that correction flow.

Follow-up, 2026-10-18: [new Person creation](PERSON_CREATION.md) is implemented and [migration 0017](../database/PERSON_CREATION_MIGRATION_0017.md) is explicitly approved and applied to Neon dev. The installed schema satisfies creation readiness. The implementation record below describes the earlier existing-Person selection slice.

Implemented locally on 2026-10-17. The owner can now open a captured-source page, inspect a profile, search existing people by name, explicitly select one and confirm the association. This closes the circular dependency in the earlier Person-page controls: an unresolved capture no longer needs a pre-existing Person link before it can be reviewed.

Capture-v2 remains disabled. No schema migration, permanent database write, real identity decision, real job processing, provider call, historical reconciliation or deployment occurred.

## User flow

The captured-source page has a **Person association** section. Loading it is a read-only action. For supported active profile captures, a bounded name search returns existing active canonical people. Results use a literal case-insensitive substring, with UUID pagination in pages of 20. Equal names remain separate choices; there is no automatic selection, URL matching, ranking by supposed identity confidence or Person merge.

Selection is followed by the existing explicit confirmation prompt. The existing owner-session review endpoint records the User identity assertion, adds the Encounter's `noticed` Person link, invalidates affected derived work and queues the identity-versioned parse input in one transaction. The original Snapshot, source Artifact identity and source quotation remain separate from the Person. The Artifact's legacy `person_id` is not populated, and no `profile_of`, `authored_by` or other typed relationship is invented.

The existing decision component preserves its request UUID and payload across failed/lost acknowledgements. Retrying a historical confirmation returns its receipt without resetting a later rejection or processing head. A new intentional confirmation remains a distinct action.

Current and historical associations are inspectable. A sole current proof can be explicitly rejected through the existing review service; dependent extracted facts are withdrawn and the no-proof processing input is queued. Historical Encounter links and User decisions remain. Conflicting Person links or proofs cannot be silently reassigned through the name picker, including after rejection. Another capture of the same Artifact does not automatically inherit the chosen Person.

If no existing Person matches, the interface explains that creating a Person from this capture remains unavailable. This slice adds reviewed association to an existing Person, not full identity reconciliation or new Person creation.

## Shared eligibility and authorization

The source-first reader, Person-page inspection and authoritative confirmation writer now share captured-profile eligibility. New confirmation requires exactly one active canonical captured Encounter, an active canonical source Artifact where one exists, and the explicit recorded source link for a v2 capture. Missing/unresolved v2 source linkage, archived or aliased sources/Encounters and ambiguous Encounter sets cannot acquire a new confirmation. A legacy supported profile with one active captured Encounter retains its compatibility path.

Eligibility is checked again by the writer after the existing processing-scope/graph locks. A stale browser cannot bypass it. The writer reports inactive captures as a private 409 target-unavailable response. Existing historical receipt replay remains read-only even when a target later becomes inactive. Rejection remains separately available for a sole supported current proof so an inactive capture does not force the owner to retain a mistaken assertion.

`GET /api/snapshot/[id]/identity` requires the existing revocable owner read session before validating IDs or querying capture/person data. It has uncached private responses, bounded search input, UUID cursors and duplicate/unknown parameter rejection. Database reads use repeatable-read/read-only transactions with a statement timeout. The route has no mutation method; confirmation/rejection retain the existing owner write-permission and exact-origin policy at `/api/review`. Capture secrets do not authorize this reader.

No source identity namespace, schema, credential or activation setting changed. The original captured bytes remain immutable. Administrative SQL validation uses `DIRECT_URL`; runtime continues using `DATABASE_URL`.

## Validation

- All 317 synthetic tests pass, including new unavailable-capture action behavior and bounded explicit name-search validation. Existing review-boundary checks also cover the new private conflict response.
- Application TypeScript and the production build/package pass. The extension code was unchanged; its package was rebuilt as part of the production command.
- The expanded `--identity-inspection-only` fixture passes 63 rollback-only Neon dev assertions. It includes prior Person-page inspection regressions and the actual v2 save → source-first lookup → explicit confirmation → fenced extraction → quotation-backed school fact → rejection path. It also checks same-name choices, literal wildcard characters, pagination, archived candidate exclusion, distinct repeated-capture identity, historical replay, no guessed attribution/relationships, and writer refusal for archived/unlinked captures. Only synthetic fixture jobs are processed. All fixture changes roll back; aggregate and extra Artifact/source-identity/link/request counts remain unchanged.
- `node scripts/browser/validate-source-identity.mjs` passes 16 headless Chromium checks of the real review components with synthetic local APIs. It verifies explicit search/selection/confirmation, same-name target selection, lost-ack retry with the identical payload, rejection, conflict presentation, unavailable/unsupported states and a mobile-width overflow check. It uses an isolated temporary profile and no real owner login or database.
- `node scripts/browser/validate-source-identity-http.mjs` passes 17 checks against the production build with synthetic private configuration and an unreachable fixture database. Signed-out/malformed/capture-secret requests cannot inspect data, cross-origin access is blocked, mutation on the read endpoint is rejected, and the captured-source page redirects to login. The fixture escapes its synthetic password-hash separators for this workspace's Next dotenv loading; it does not change `.env`.

These checks do not establish deployed authenticated end-to-end behavior, complete mobile/accessibility coverage, high-volume performance, a real worker host or successful concurrent commits against real captures. Backup restoration verification remains deferred.

## Next work

Creating a new Person from an unresolved capture, reviewed reassignment/source duplicate reconciliation, and supported typed relationships remain separate product work. Recurring worker hosting, enabled/deployed verification, calibrated semantic recall, normal extension installation/update checks and reviewed historical backfill remain open.
