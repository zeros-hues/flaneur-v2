import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { scryptSync } from "node:crypto";
const bundle = await build({ entryPoints: ["lib/session/owner-runtime.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { ownerSessionRuntime, ownerSessionReadiness } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", foreign = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
// Canonical synthetic record; tests below reject before password verification.
const passwordHash = `flaneur-scrypt-v1$${Buffer.alloc(16, 1).toString("base64url")}$${Buffer.alloc(32, 2).toString("base64url")}`;
const config = { ownerPrincipalId: owner, passwordHash, origin: "https://example.test" };
const cookie = `__Host-flaneur-session=${Buffer.alloc(32, 3).toString("base64url")}`;
function stores(grant = null) {
  let calls = 0;
  return { sessions: { lookup: async () => grant, create: async () => { throw new Error("UNEXPECTED_ISSUANCE"); },
    revoke: async () => {}, revokeAll: async () => {} }, throttle: { consume: async () => { calls++; return false; } },
    throttleCalls: () => calls };
}
test("composed authorization checks both owner identity and requested permission", async () => {
  const request = new Request(config.origin, { headers: { cookie } });
  for (const [principalId, permission, read, write] of [[owner, "write", true, true], [owner.toUpperCase(), "read", true, false],
    [foreign, "write", false, false], [foreign, "read", false, false]]) {
    const runtime = ownerSessionRuntime(stores({ principalId, permission }), config);
    assert.equal(await runtime.authorize(request, "read"), read);
    assert.equal(await runtime.authorize(request), write);
  }
});
test("legacy capture headers and cookies never authorize composed runtime", async () => {
  const runtime = ownerSessionRuntime(stores({ principalId: owner, permission: "write" }), config);
  assert.equal(await runtime.authorize(new Request(config.origin, { headers: { "x-capture-secret": "synthetic", cookie: "x-capture-secret=synthetic" } })), false);
});
test("composition supplies the shared throttle to login before credential verification", async () => {
  const supplied = stores(), runtime = ownerSessionRuntime(supplied, config);
  const response = await runtime.handleSession(new Request(config.origin, { method: "POST",
    headers: { origin: config.origin, "content-type": "application/json" }, body: JSON.stringify({ action: "login", credential: "synthetic credential" }) }));
  assert.equal(response.status, 429); assert.equal(supplied.throttleCalls(), 1); assert.equal(response.headers.has("set-cookie"), false);
});
test("configuration errors expose only a stable message without secrets", () => {
  for (const replacement of [{ passwordHash: "SYNTHETIC_PRIVATE_HASH" }, { ownerPrincipalId: "PRIVATE_INVALID_ID" },
    { origin: "https://user:PRIVATE@example.test" }, { origin: "http://example.test" }, { maxAttempts: 0 }, { windowSeconds: 59 }])
    assert.throws(() => ownerSessionRuntime(stores(), { ...config, ...replacement }), { message: "OWNER_SESSION_CONFIGURATION_INVALID" });
});
test("readiness returns booleans, validates Next-loaded values, and never reports configuration values", () => {
  const env = { OWNER_PRINCIPAL_ID: owner, OWNER_PASSWORD_HASH: passwordHash, OWNER_SESSION_ORIGIN: config.origin,
    DATABASE_URL: "postgres://synthetic:PRIVATE@database.test/synthetic", DIRECT_URL: "postgres://irrelevant" };
  assert.deepEqual(ownerSessionReadiness(env), { ownerPasswordConfigured: true, originConfigured: true,
    runtimeDatabaseConfigured: true, configurationReady: true });
  assert.equal(ownerSessionReadiness({ ...env, OWNER_PASSWORD_HASH: passwordHash.replaceAll("$", "\\$") }).configurationReady, false);
  assert.equal(ownerSessionReadiness({ ...env, DATABASE_URL: "https://database.test" }).configurationReady, false);
  assert.deepEqual(ownerSessionReadiness({}), { ownerPasswordConfigured: false, originConfigured: false,
    runtimeDatabaseConfigured: false, configurationReady: false });
  assert.equal(Object.values(ownerSessionReadiness(env)).every(value => typeof value === "boolean"), true);
});
test("authorization storage failures remain unavailable rather than granting access", async () => {
  const supplied = stores(); supplied.sessions.lookup = async () => { throw new Error("SYNTHETIC_STORAGE_FAILURE"); };
  await assert.rejects(ownerSessionRuntime(supplied, config).authorize(new Request(config.origin, { headers: { cookie } })), /SYNTHETIC_STORAGE_FAILURE/);
});
test("composed password login, owner authorization and logout work together using synthetic stores", async () => {
  const credential = "synthetic long owner password", salt = Buffer.alloc(16, 4);
  const key = scryptSync(credential, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  const records = new Map(); let consumed = 0;
  const sessions = {
    async create(record) { records.set(record.tokenHash, record); return { expiresAt: "2026-10-19T00:00:00Z" }; },
    async lookup(hash) { const record = records.get(hash); return record ? { principalId: record.principalId, permission: record.permission } : null; },
    async revoke(hash) { records.delete(hash); }, async revokeAll(id) { for (const [hash, record] of records) if (record.principalId === id) records.delete(hash); },
  };
  const runtime = ownerSessionRuntime({ sessions, throttle: { consume: async () => { consumed++; return true; } } },
    { ...config, passwordHash: `flaneur-scrypt-v1$${salt.toString("base64url")}$${key.toString("base64url")}` });
  const request = (body, value) => new Request(config.origin, { method: "POST", headers: { origin: config.origin,
    "content-type": "application/json", ...(value ? { cookie: value } : {}) }, body: JSON.stringify(body) });
  assert.equal((await runtime.handleSession(request({ action: "login", credential: "incorrect synthetic password" }))).status, 401);
  const login = await runtime.handleSession(request({ action: "login", credential }));
  assert.equal(login.status, 200); assert.equal(consumed, 2); assert.equal(records.size, 1);
  const value = login.headers.get("set-cookie").split(";", 1)[0];
  assert.equal(await runtime.authorize(new Request(config.origin, { headers: { cookie: value } })), true);
  assert.equal((await runtime.handleSession(request({ action: "logout" }, value))).status, 204);
  assert.equal(await runtime.authorize(new Request(config.origin, { headers: { cookie: value } })), false);
  assert.equal(records.size, 0);
});
