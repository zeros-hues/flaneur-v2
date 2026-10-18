# Capture-v2 endpoint and finite parse-worker preparation

Implemented and validated locally on 2026-10-17. This slice connects the existing durable capture and extraction services to explicit runtime entry points. It does not switch the extension, start a worker against the real queue, or activate v2 capture.

## Runtime entry points

`POST /api/capture/v2` uses the direct runtime SQL pool (`DATABASE_URL`), the existing extension capture-secret authentication, and an explicit `CAPTURE_V2_ENABLED=true` gate. The current local configuration was checked without printing values: the gate is off. No `.env` or deployment configuration was changed. Password/session authentication still protects dashboard operations independently of the capture-secret transport.

Authentication precedes activation checks, body decoding and database operations. Missing/incorrect capture credentials return private 401 responses. Unavailable authentication settings return a generic 503. An authenticated request to the disabled endpoint returns 503 `capture_v2_disabled` without reading its body or saving it. Responses use no-store/nosniff headers, vary by the capture-secret header, and do not grant browser CORS access. The old `/api/capture` route remains available for the existing extension; its synchronous parsing and enrichment are not invoked by the new endpoint.

When explicitly enabled later, the endpoint atomically stores the compressed original, Encounter, optional exact User reason, parse head/job and request receipt before acknowledging saved. Parsing, enrichment and providers are absent from that request transaction. Replaying the same canonical request UUID returns the original records and current processing state; changed input under the same UUID is a conflict. A new intentional save remains a separate Encounter. PostgreSQL handles the client timestamp as text rather than letting the JavaScript driver round away microseconds. The exact client timestamp spelling is also preserved in Encounter source metadata, alongside its unverified-clock label. Neither a URL nor an old Person projection establishes identity.

The store applies statement/lock timeouts and uses public-qualified tables. No table or migration was added. New application limits are 4,000,000 raw JSON bytes and 3,000,000 decoded HTML UTF-8 bytes; JSON escaping counts separately. These conservative application limits replace the earlier prepared-only 20,100,000/10,000,000 bounds. They are not a measured hosting capacity claim. Unsupported declared media types, malformed UTF-8, NULs and unpaired surrogates fail validation. Reason text and valid captured Unicode/spacing are preserved rather than repaired silently.

`npm run worker:parse` (or `-- --check`) prints a prepared status without loading `.env`, creating a database connection or claiming jobs. The explicit execution command is:

```powershell
npm run worker:parse -- --run
# Optional bounded batch size:
npm run worker:parse -- --run --max-jobs=10
```

**These execution commands have not been run against the real queue.** They use `DATABASE_URL`, not the administrative migration connection. They claim only parse jobs and default to five jobs, a 30-second claim budget and 120-second renewable leases. Maximum batch size is 100. The deadline and shutdown signal stop new claims; in-flight work retains the existing lease and fenced-completion rules. The claim budget is not a hard interruption timer or a worker-host lifetime guarantee. Outcome reports contain aggregate counts and stable codes, never source text, connection strings or private record IDs. Errors in applying output roll back through the existing store; stale leases cannot publish results. The CLI closes its pool and handles shutdown without scheduling detached work.

The worker performs the prepared deterministic normalization/field extraction only. Without a supported identity proof it can preserve a normalized representation while leaving identity unresolved; a succeeded parse is not a claim that Person/Artifact resolution or enrichment is complete. Missing/ambiguous source roots quarantine processing while retaining the saved original. No provider is started. Durable queue storage exists, but a recurring worker host/scheduler is still unselected and unconfigured.

The prepared extension transport now requires the complete durable acknowledgement, including a valid processing state and boolean replay indicator, before removing an outbox item. A saved capture can legitimately have failed or quarantined processing; that does not make its original unsaved. Missing/unknown processing fields and malformed replay indicators retain the queued payload. The packaged background/content entry points still use their earlier delivery path.

## Validation

- All 285 synthetic tests pass, including seven new activation/batch cases: authorization and disabled-gate ordering, auth-setting privacy, declared/streamed request limits, media/UTF-8/text validation, exact/canonical inputs, bounded worker outcomes, deadline/shutdown/idle behavior, invalid budgets and a database-free default worker command. Existing delivery tests now check the complete acknowledgement contract.
- Application and extension TypeScript checks and the production build pass. The build includes the separate `/api/capture/v2` route.
- `node scripts/database/validate.mjs --capture-runtime-only` passes 37 rollback-only Neon dev checks through `DIRECT_URL`. The fixture refuses to proceed if any real queued/leased work exists and briefly locks job writes. It exercises the actual capture store/handler, outbox retry transport, extraction reader query body, normalizer, job store, fenced output application and batch runner. It verifies exact original gzip contents, microsecond client clocks, exact User reason, changed-input conflict, UUID spelling, lost acknowledgement without duplicate receipts, interrupted-save rollback, repeated intentional encounters, absent reason, normalized output, quarantine, actual-state replay, no guessed Person link and deferred integrity constraints.
- All synthetic SQL data rolls back. Aggregate snapshot/Encounter/observation/job/evidence counts and capture-request counts are unchanged. No real capture was submitted or real queued job processed. The full SQL suite and concurrent successful commit/replay cases were not rerun/proven by this rollback-only fixture.
- `node scripts/browser/validate-capture-http.mjs` passes 18 built-app HTTP assertions. It launches and closes its own local Next server with synthetic credentials, v2 explicitly disabled, and unreachable fixture database URLs. It checks unauthorized/disabled responses, private headers, unsupported methods and absent CORS permission. This proves the tested disabled/auth paths require no database connection; it is not an enabled deployment test or a real Chrome extension test.
- Neon preflight confirms 17 matching applied ledger entries, 41 public tables and no pending migration. An initial connection timeout was resolved by a successful read-only preflight and validation retry. No credentials or private rows were printed.

## Next activation work

1. Wire the extension's trusted background outbox, startup/alarm retry scheduling and explicit authentication resume to the versioned endpoint. Align queue validation with both request and decoded-content limits, preserving a payload when persistence or delivery fails.
2. Update overlay feedback to distinguish queued locally, saved remotely and processing outcome. Remove repeat-save suppression and blocking automatic profile scrolling; preserve partial capture and support deliberate fuller recapture.
3. Exercise real Chrome service-worker suspension, reload/offline delivery, quota failure, credential replacement, keyboard/accessibility and saved acknowledgement behavior using synthetic captures.
4. Complete source/Artifact resolution and encounter linking without assuming identities. Validate supported identity/field reprocessing and user review. Select and verify a recurring worker host and its runtime/shutdown/request-size constraints before activation. No provider timeout or scheduling guarantee has been established by a finite CLI.
5. Review enablement and deployment with the completed extension/worker configuration. Measure save acknowledgement latency independently of extraction. Historical backfill remains separately reviewed and unexecuted; backup restoration verification stays deferred.

No permanent schema change, real notebook mutation, historical backfill, live worker run, provider request or deployment occurred in this slice.
