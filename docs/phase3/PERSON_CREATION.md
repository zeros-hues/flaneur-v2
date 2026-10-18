# Create a Person from a reviewed captured profile

Follow-up, 2026-10-18: future explicit creation/confirmation decisions now maintain qualified, supported [profile relationships](REVIEWED_PROFILE_RELATIONSHIPS.md) without assigning a legacy profile URL or inferring authorship. The earlier creation record below predates that integration.

Follow-up, 2026-10-18: [reviewed reassignment](IDENTITY_REASSIGNMENT.md) now corrects a sole active current confirmed association to an explicitly chosen existing Person. Creation still refuses captures with recorded Person links. Shared transaction refactoring passes the 40 installed-schema creation regression checks; it does not change the new-Person identity policy below.

Implemented locally, with migration 0017 explicitly approved and applied to Neon dev on 2026-10-18. The owner can create a new Person from an unresolved supported profile after checking existing people, entering a name and explicitly confirming the decision. The installed nullable schema now satisfies the creation readiness check. No real Person was created, and no deployment was performed; capture-v2 remains disabled. See [migration report](../database/PERSON_CREATION_MIGRATION_0017.md).

Post-application verification passes 40 installed-schema creation checks, 63 identity regressions and 14 export checks. All fixtures rolled back and counts stayed unchanged; the migration runner's idempotency rerun applied zero changes. Preflight confirms 18 matching entries, 41 public tables and no pending migration. The earlier local code/browser/build results below remain the preparation baseline.

## Decision and identity

The captured-source review section first supports searching existing people. Once a search has been made, an eligible unresolved capture can offer a separate creation form. Equal names remain separate people; search results do not automatically choose, merge or prevent a deliberately distinct Person. The owner can edit the name, review the proposed action, confirm or cancel.

The service accepts only a request UUID, Snapshot UUID and bounded owner-entered name. Names are trimmed and must be non-empty, at most 200 UTF-16 units, valid Unicode and free of control characters. Callers cannot supply a Person ID, profile URL, inferred attributes, authorship or creation time. The new Person's UUID derives from the decision request, not its name or captured source URL.

New rows have `profile_url = null`. The source URL remains on its recorded source objects. A pre-existing legacy Person at that URL is neither adopted nor changed. New people have no guessed headline, biography, employer, school, photo or source-key mapping. The owner's name and identity decision remain recorded in the User proof. First capture time uses the trusted capture request receipt time, or the recorded Encounter time for the supported legacy compatibility path; it does not use the unverified client capture clock.

This does not discover identities automatically, merge same-name people, reassign conflicting capture associations, propagate identity to repeated captures or create typed authorship/profile relationships. Those remain separate reviewed work.

## Atomic writes and retries

The existing owner write-session/exact-origin review boundary accepts `create_person_from_profile`. Creation uses the existing processing-scope-before-graph lock order and active capture/source eligibility checks. It refuses unsupported or inactive captures and any capture with a current identity proof or historical noticed-Person link.

One transaction inserts the Person, immutable User identity proof, Encounter `noticed` link and identity-versioned parse head/job, including dependency invalidation. A queue failure rolls back the Person and proof as well as the link. Work is queued rather than executed in the request; the UI does not claim extracted facts are ready.

The original request UUID and normalized name are retained for retries. An unchanged replay returns the historical proof without checking the later target state, adding rows or resetting processing. Changing its Snapshot/name conflicts. Reusing a confirmation UUID for creation, or a creation UUID for an existing-person confirmation, also conflicts. Rejection and archival do not make an old retry recreate/reassociate a Person. The new Person remains in history after rejection, while dependent generated facts are withdrawn.

The UI preserves the creation payload on network, acknowledgement and service failures. It validates the returned Snapshot/Person receipt before refreshing the recorded association. A cancelled creation does not send a write. Before schema readiness, both UI availability and the authoritative service fail closed; direct API requests cannot bypass the database requirement.

## Schema, export and validation

Migration 0017 only removes `NOT NULL` from the legacy Person URL field. It preserves the unique index for non-null URLs. Application types now admit nullable search-hit URLs; safe Person-page source links already handle absence. It is installed on the authorized Neon dev target.

Export remains v3 with schema tag `0017` for the new nullable catalog, preserving null cells and exact names. Installed 0016 exports still work. The new tag does not imply restore/import support.

Validation passes 324 synthetic tests, application TypeScript, production build/package, 42 rollback-only proposed migration/creation SQL assertions, 63 identity regression assertions, 14 export regressions, 26 synthetic-API browser checks and 25 built-app HTTP checks. All database fixtures roll back and aggregate counts remain unchanged. No real Person, identity decision or job was submitted; no private export file, provider request, activation or deployment occurred.

The SQL fixture explicitly exercises only its synthetic job ID. Its queue-failure case proves no orphan Person/association remains. Browser checks use an isolated temporary Chrome profile and synthetic APIs; HTTP checks use synthetic private settings and an unreachable fixture database. Successful deployed authenticated creation, concurrent committed creation across real requests, load tests, complete accessibility/mobile verification and restoration remain unverified. Restoration is deferred at the user's request.

## Next work

Migration 0017 is now applied under explicit authorization. Reviewed reassignment/source duplicate reconciliation, supported typed relationships, recurring worker hosting, enabled/deployed end-to-end verification, calibrated semantic recall and reviewed historical backfill remain open.
