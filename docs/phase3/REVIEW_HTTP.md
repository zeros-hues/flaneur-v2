# Review HTTP boundary, prepared

Current update, 2026-10-12: the local `POST /api/review` route now uses all seven actual PostgreSQL stores, configured owner-session write authorization, and HTTPS-only exact-Origin policy. All 217 synthetic tests, TypeScript, production build, 131 focused rollback-only Neon review SQL checks, and 10 built-route HTTP rejection assertions pass. No real owner review or deployment was performed; evidence/identity review UI remains pending. See [route integration](REVIEW_ROUTE.md). Earlier statements below describe preparation history.

Update, 2026-10-12: migration 0014 is now applied on authorized Neon dev; actual-schema session validation passed 19 rollback-only checks. See [migration report](../database/SESSION_MIGRATION_0014.md). Earlier pending-migration statements below describe preparation history. Credential configuration and live integration remain pending.

Date: 2026-10-12. `lib/review/handler.ts` prepares a supplied-dependency handler for explicit User reviews. No application route imports it, no authorization policy is configured, and no live mutation was executed.

The factory requires supplied observation/identity/archive stores, a configured deployment origin, and an authorization callback. That callback must validate a revocable session and permission to change the notebook. A [session-backed callback](SESSIONS.md) is now prepared but not configured; its schema migration remains unapplied. This factory does not implement login and does not connect the old shared capture secret as dashboard authorization. It checks authorization before reading the body or calling a store. Authorization failure is private and does not expose policy exceptions.

Requests must use POST, an exact Origin matching the configured origin, and `application/json`. The trusted origin comes from configuration, never the incoming Host header. Missing, null, multiple, or foreign origins are rejected. JSON is read from the stream with a 144,000-byte limit independent of Content-Length; excessive bodies are canceled and malformed UTF-8 fails. The limit covers maximum authored text/comment sizes even with JSON escape expansion. Deployment request timeouts and session/rate controls remain integration work.

The strict envelope has only `action` and `payload`. Each action dispatches to its existing strict service validator and transactional store:

| Action | Payload |
| --- | --- |
| `confirm_observation` | `requestId`, `observationId`, optional `comment` |
| `correct_observation` | `requestId`, `observationId`, `bodyText`, optional `comment` |
| `reject_observation` | `requestId`, `observationId`, optional `comment` |
| `archive_observation` | `requestId`, `observationId` |
| `archive_person` | `requestId`, `personId` |
| `confirm_identity` | `requestId`, `snapshotId`, `personId` |
| `reject_identity` | `requestId`, `snapshotId`, `observationId`, optional `comment` |

Each explicit gesture generates one request UUID; retries reuse that UUID and identical action/payload. IDs must be UUIDs. Confirmation accepts no replacement text, correction preserves authored text, and identity proofs use dedicated identity review. Services preserve truth-layer history, atomic downstream invalidation, and historical replay behavior. This boundary does not create identities, reassign them, restore archived records, or automatically invoke review from model output. UI integration must represent a real explicit User decision.

Successful responses return the service receipt/result with status 200. Public failures contain stable codes: malformed input 400, unavailable authorization 401, disallowed origin 403, wrong method 405, oversized body 413, non-JSON content 415, changed request/stale target/review-specific conflicts 409, unsupported review 422, and other unavailable operations 503. Driver details, raw validation errors, authorization exceptions, and request contents are neither returned nor logged. All responses use `Cache-Control: no-store`, `Vary: Cookie, Authorization`, and `X-Content-Type-Options: nosniff`.

Nine tests cover all seven service dispatches, denied/failed authorization, origin/method/content-type checks, strict envelope and service validation, streamed byte limits, invalid Unicode, maximum escaped text, stable conflict responses, private driver failures, and invalid configured origins. Run `node --test scripts/phase3/review-handler.test.mjs`. SQL was unchanged and not rerun for this step; the preceding 211 SQL checks remain the database baseline. The full synthetic suite has 162 passing tests and TypeScript passes.
