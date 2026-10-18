# Session HTTP boundary, prepared

Current update, 2026-10-12: owner-password configuration passes the private readiness check. Dashboard login/logout, page authentication, and async API guards now use revocable owner sessions in the local codebase; extension capture keeps its separate credential. All 212 synthetic tests, TypeScript, the production build, and 22 built-app HTTP smoke assertions pass. No Vercel deployment or database mutation was performed; HTTPS browser login/cookie verification remains pending. The ledger remains 16 applied entries. See [dashboard integration](DASHBOARD_AUTH.md). Earlier statements below retain preparation history.

Current update, 2026-10-12: owner-session server composition and private auth:status checks are prepared. All 207 synthetic tests and TypeScript pass. The selected HTTPS origin is saved locally and passes the private readiness check; owner-password configuration remains unready and the runtime database URL is configured. Live login remains disconnected, no database or Vercel deployment was changed, and the ledger remains 16 applied entries. See [server integration contract](OWNER_RUNTIME.md). Older entries below retain historical counts/state.

Update, 2026-10-12: migration 0014 is now applied on authorized Neon dev; actual-schema session validation passed 19 rollback-only checks. See [migration report](../database/SESSION_MIGRATION_0014.md). Earlier pending-migration statements below describe preparation history. Credential configuration and live integration remain pending.

Date: 2026-10-12. `lib/session/handler.ts` prepares login and logout operations using the session service. It is not imported by any application route. Migration 0014 remains unapplied; the existing shared-secret login and cookie remain unchanged.

The factory requires a session store, a login provider, a configured HTTPS origin, an auth-owner UUID, and a login-throttle callback. The provider verifies the credential and returns a trusted read/write owner grant. The handler rejects another principal, invalid grants, and caller-supplied principal/permission/TTL fields. No login method, credential, owner UUID, or provider is loaded from `.env` by this factory. The actual provider and deployed throttle must be configured before activation.

Requests use POST and an exact Origin matching the configured origin, with `application/json`. Body size is capped at 8,192 actual bytes, independently of Content-Length. Malformed UTF-8, invalid JSON/envelopes, NUL/lone-surrogate credentials, and oversized input fail before login work. Credential strings retain exact whitespace and have a 1,024 UTF-16-unit maximum. HTTPS is required because the host-only session cookie is Secure.

| Action | Request fields | Result |
| --- | --- | --- |
| `login` | `action`, `credential` | Verify throttle/owner, issue a new session, set HttpOnly host cookie; JSON contains only authenticated state and expiry |
| `logout` | `action` | Revoke the presented token and clear its cookie; missing/expired cookies may still clear locally |
| `logout_all` | `action` | Require a valid session for the configured owner, derive principal from that session, revoke that principal's sessions, clear this cookie |

Login issues a new random token and never accepts a caller-supplied token. It does not automatically revoke an earlier session on login; revocation uses the explicit logout controls. Other devices remain valid after single-device logout. All-device logout accepts a valid owner session, including read permission, because it is a self-account control; it grants no notebook mutation permission. Revocation errors return unavailable and do not clear the cookie or claim success. Invalid/expired sessions cannot invoke all-device revocation.

Cookies use `__Host-flaneur-session`, HttpOnly, Secure, SameSite Strict, Path `/`, and the session service's TTL. Tokens appear only in the Set-Cookie header; they are not in JSON, logs, URLs, or storage records. Clearing uses the same scope and Max-Age zero. Responses use no-store, Cookie/Authorization variation, and nosniff. Stable failures cover method/origin/content/input rejection, throttling, unauthorised login/session, and private provider/store failure. No raw exceptions or credentials are exposed.

Nine tests cover owner/provider validation, throttle ordering/failure, secure cookie/JSON separation, method/origin/content/body rejection, independent-device logout, owner-derived all-device revocation, unavailable revocation, and private errors. Run `node --test scripts/phase3/session-handler.test.mjs`. All 177 synthetic tests and TypeScript pass. No SQL changed or database validation reran in this step; the prior 211 complete SQL baseline and 18 focused session checks remain separate. Live provider/throttle configuration, migration application, browser cookie verification, login UI, and route integration remain pending.
