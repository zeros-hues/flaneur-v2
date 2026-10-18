# Reviewed captured-profile reassignment

Follow-up, 2026-10-18: [reviewed profile relationships](REVIEWED_PROFILE_RELATIONSHIPS.md) now maintain typed `profile_of` support and state within future explicit identity transactions, including reassignment and rejection. The earlier implementation record below predates that typed relationship integration.

Implemented locally on 2026-10-18 using the existing schema. The owner can correct one current confirmed profile association by selecting another existing Person, entering a reason and explicitly confirming reassignment. No schema migration, real identity decision, provider request or deployment was performed. Capture-v2 remains disabled.

## Scope and owner decision

The captured-source review page offers replacement selection only when a supported active profile has exactly one current identity proof and exactly one matching noticed-Person link. Both the current and selected people must be active canonical objects. Archived/aliased captures or people, multiple/conflicting proofs or links, unsupported captures, and an already-rejected identity cannot be reassigned through this flow. Those cases still need separate reviewed reconciliation.

The owner searches existing people, selects a replacement, enters a non-empty reason and reviews the move from the named current Person to the named replacement. Cancellation sends no write. Names and URLs do not select, deduplicate or merge a Person automatically. This does not change any other capture of the same Artifact.

The private `reassign_identity` action uses the existing owner write-session and exact HTTPS origin policy. Its strict payload includes the expected current proof UUID, current Person UUID, replacement Person UUID, Snapshot UUID, request UUID and reason. The reason is at most 2,000 UTF-16 units and must be valid PostgreSQL Unicode text. Its exact whitespace and line breaks are preserved. A self-reassignment, malformed payload or changed/stale proof is rejected before any correction commits.

## Atomic correction and retained history

The writer takes all affected processing scopes before the memory graph lock, including the Snapshot parse scope and enrichment/index scopes for both people. It rechecks the expected proof, sole link and active objects after locking.

One transaction:

1. Inserts a new immutable User identity proof on the replacement Person. Its structured decision retains the original proof, original Person, replacement Person, Snapshot, request and exact reason.
2. Appends a rejected review on the original proof with that reason. The original assertion and its derived records remain stored for history.
3. Corrects the captured Encounter's current `noticed` projection by removing the old Person link and inserting the replacement link. The prior association is retained in the original proof and immutable reassignment decision. Artifact/source links and original capture bytes are untouched.
4. Invalidates affected generated dependencies and enrichment/index work, then queues a new identity-versioned parse input. A stale parse lease cannot commit older output after the correction.

The new proof does not use a cross-Person `supersedes_id`: assertions on different subjects retain their own immutable identities. The explicit review and decision metadata record the correction instead. A failure while queuing replacement processing rolls back the new proof, old-proof review and link change together.

Direct User notes on the original Person remain there, unchanged. Original User words on the captured Encounter remain unchanged and now flow through its corrected Person association. The former Person's identity/observation inspection still exposes the captured profile's prior proof and rejected review. The source review page shows the current reassignment reason and links to the earlier Person/decision. Metadata is validated before being used by the read model.

Old supported extracted facts become ineligible immediately through the reviewed proof and changed parse head. Supported replacement facts become eligible only after the new fenced parse succeeds. The original Snapshot, normalized representation and old fact records stay inspectable. No legacy Artifact author, source identity key, Person merge/alias or typed authorship relationship is invented.

## Retries and stale clients

The UI retains the complete request UUID/payload across network and acknowledgement failures and validates the returned Snapshot/Person receipt. A replay of the identical decision returns its historical proof without changing the later link or processing head. Changed reason/targets conflict. Later rejection does not make an old reassignment retry restore the association. Replaying the earlier original confirmation also leaves the correction intact.

Creation, ordinary confirmation and reassignment share a guarded receipt namespace: a UUID already used for a different decision kind cannot be silently reused. A fresh request must still match the current expected proof, preventing an outdated browser from replacing a newer review.

## Validation and limits

- All 331 synthetic tests, application TypeScript and the production build/package pass. Seven new tests cover reassignment/retry atomicity, exact reasons, stale/ambiguous/inactive targets, queue-failure rollback, historical replay, review context and owner/origin validation.
- `node scripts/database/validate.mjs --identity-reassignment-only` passes 44 rollback-only Neon dev assertions through `DIRECT_URL`. It exercises actual capture/confirmation/fenced extraction/reassignment/re-extraction, old/new supported facts, stale-worker refusal, both people’s queued-index invalidation, exact source/note preservation, current-link correction, inspection history, changed/cross-kind requests, archived/ambiguous guards, queue-failure rollback and later rejection/historical replay. Only synthetic fixture job IDs are processed. All fixtures roll back and aggregate/additional source/link/request counts remain unchanged.
- Existing identity inspection/confirmation/rejection passes 63 rollback-only regression assertions after its transaction adapter was shared with reassignment.
- Installed-schema Person creation passes 40 rollback-only regression assertions. Together, the three SQL fixtures pass 147 assertions and leave aggregate counts unchanged.
- The real review components pass 37 headless Chromium checks with synthetic local APIs. Added coverage includes replacement selection, required reason, review/cancellation, exact reason/expected-proof payload, lost-ack retry, displayed reason and earlier-Person history link.
- The production app passes 28 HTTP checks using synthetic private settings and an unreachable fixture database, including denial of unauthenticated reassignment writes and capture-secret substitution. Existing authenticated origin behavior is covered by the injected owner-policy tests.

No real Person/capture/job or identity correction, permanent data/schema change, private export, provider request, backfill or deployment occurred. Browser tests use an isolated temporary profile and no real owner login. The full SQL suite, committed concurrent browser decisions, deployed authenticated end-to-end behavior, load testing and complete mobile/accessibility coverage remain unverified. Backup restoration verification remains deferred.

## Next work

Reviewed source/Person duplicate reconciliation, already-rejected or ambiguous identity resolution, and supported typed relationships remain separate work. Recurring worker hosting/readiness, enabled/deployed integration, calibrated semantic recall, normal extension installation/update and reviewed historical backfill remain open.
