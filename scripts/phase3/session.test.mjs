import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["lib/session/service.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { issueSession, authenticateSession, revokeSession, revokePrincipalSessions, sessionAuthorizer, SESSION_COOKIE_V2 } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const principal = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function store() {
  const rows = new Map(); let clock = 0, reads = 0;
  return { rows, reads: () => reads, expire() { clock = 999999999; },
    async create(row) { rows.set(row.tokenHash, { ...row, expires: clock + row.ttlSeconds, revoked: false });
      return { expiresAt: "2026-10-13T00:00:00Z" }; },
    async lookup(hash) { reads++; const row = rows.get(hash);
      return row && !row.revoked && row.expires > clock ? { principalId: row.principalId, permission: row.permission } : null; },
    async revoke(hash) { const row = rows.get(hash); if (row) row.revoked = true; },
    async revokeAll(id) { for (const row of rows.values()) if (row.principalId === id) row.revoked = true; } };
}
test("issuance stores only hashed random tokens and returns secure host cookie settings", async () => {
  const target = store(), first = await issueSession({ principalId: principal, permission: "write" }, target);
  const second = await issueSession({ principalId: principal, permission: "write" }, target);
  assert.equal(first.token.length, 43); assert.equal(first.token === second.token, false);
  assert.equal([...target.rows.values()].some((r) => Object.values(r).includes(first.token)), false);
  assert.equal([...target.rows.keys()].every((k) => /^[0-9a-f]{64}$/.test(k)), true);
  assert.equal(first.cookie.secure && first.cookie.httpOnly, true); assert.equal(first.cookie.sameSite, "strict");
});
test("read sessions cannot mutate; write grants support read and write", async () => {
  const target = store(), read = await issueSession({ principalId: principal, permission: "read" }, target);
  const write = await issueSession({ principalId: principal, permission: "write" }, target);
  assert.equal((await authenticateSession(read.token, target))?.principalId, principal);
  assert.equal(await authenticateSession(read.token, target, "write"), null);
  assert.equal((await authenticateSession(write.token, target, "write"))?.permission, "write");
});
test("expiry and per-device/all-device revocation are authoritative on every request", async () => {
  const target = store(), first = await issueSession({ principalId: principal, permission: "write" }, target);
  const second = await issueSession({ principalId: principal, permission: "write" }, target);
  await revokeSession(first.token, target); await revokeSession(first.token, target);
  assert.equal(await authenticateSession(first.token, target), null); assert.ok(await authenticateSession(second.token, target));
  await revokePrincipalSessions(principal, target); assert.equal(await authenticateSession(second.token, target), null);
  const third = await issueSession({ principalId: principal, permission: "write", ttlSeconds: 60 }, target);
  target.expire(); assert.equal(await authenticateSession(third.token, target), null);
});
test("malformed and noncanonical tokens cannot query the store", async () => {
  const target = store();
  for (const token of [null, "secret", "a".repeat(44), "=".repeat(43), "%".repeat(43), "_".repeat(43)])
    assert.equal(await authenticateSession(token, target), null);
  assert.equal(target.reads(), 0);
});
test("review authorizer rejects duplicate/encoded cookies and capture-secret fallback", async () => {
  const target = store(), issued = await issueSession({ principalId: principal, permission: "write" }, target);
  const authorize = sessionAuthorizer(target);
  const request = (cookie) => new Request("https://flaneur.example", { headers: { cookie, "x-capture-secret": "ignored" } });
  assert.equal(await authorize(request(`${SESSION_COOKIE_V2}=${issued.token}`)), true);
  for (const cookie of [`${SESSION_COOKIE_V2}=${issued.token}; ${SESSION_COOKIE_V2}=${issued.token}`, "x-capture-secret=ignored",
    `${SESSION_COOKIE_V2}=%${issued.token}`]) assert.equal(await authorize(request(cookie)), false);
});
test("invalid issue grants/TTL fail before storing; store failures never authorize", async () => {
  const target = store();
  for (const change of [{ principalId: "bad" }, { permission: "owner" }, { ttlSeconds: 0 }, { ttlSeconds: 2592001 }, { token: "caller-supplied" }])
    await assert.rejects(issueSession({ principalId: principal, permission: "write", ...change }, target));
  assert.equal(target.rows.size, 0);
  const issued = await issueSession({ principalId: principal, permission: "write" }, target);
  target.lookup = async () => { throw new Error("store failed"); };
  await assert.rejects(authenticateSession(issued.token, target), /store failed/);
});
