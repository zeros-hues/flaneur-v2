import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["lib/session/handler.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { sessionHandler } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function setup() {
  const calls = [], records = new Map();
  const store = { async create(record) { calls.push("create"); records.set(record.tokenHash, record); return { expiresAt: "2026-10-19T00:00:00Z" }; },
    async lookup(hash) { const r = records.get(hash); return r ? { principalId: r.principalId, permission: r.permission } : null; },
    async revoke(hash) { calls.push("revoke"); records.delete(hash); },
    async revokeAll(id) { calls.push("revokeAll"); for (const [key, r] of records) if (r.principalId === id) records.delete(key); } };
  const provider = { async verify() { calls.push("verify"); return { principalId: owner, permission: "write" }; } };
  const policy = { origin: "https://flaneur.example", ownerPrincipalId: owner, async allowLogin() { calls.push("throttle"); return true; } };
  return { calls, records, store, provider, policy, handler: () => sessionHandler(store, provider, policy) };
}
function request(body, options = {}) {
  const method = options.method ?? "POST";
  return new Request("https://flaneur.example/api/session", { method,
    headers: { origin: "https://flaneur.example", "content-type": "application/json", ...options.headers },
    ...(method === "GET" ? {} : { body: options.raw ?? JSON.stringify(body) }) });
}
async function login(data) {
  const response = await data.handler()(request({ action: "login", credential: "synthetic credential" }));
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie"); assert.ok(cookie);
  return { response, cookie: cookie.split(";", 1)[0] };
}
test("login issues a host cookie only after throttle and owner verification; JSON contains no token", async () => {
  const data = setup(), { response } = await login(data);
  assert.deepEqual(data.calls, ["throttle", "verify", "create"]);
  const body = await response.json(); assert.deepEqual(Object.keys(body).sort(), ["authenticated", "expiresAt"]);
  const header = response.headers.get("set-cookie");
  assert.equal(["HttpOnly", "Secure", "SameSite=Strict", "Path=/"].every((value) => header.includes(value)), true);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("invalid credentials, foreign owners and untrusted grant shapes never create sessions", async () => {
  for (const result of [null, { principalId: other, permission: "write" }, { principalId: owner, permission: "owner" }]) {
    const data = setup(); data.provider.verify = async () => result;
    const response = await data.handler()(request({ action: "login", credential: "synthetic" }));
    assert.ok([401, 503].includes(response.status)); assert.equal(data.calls.includes("create"), false);
    assert.equal(response.headers.has("set-cookie"), false);
  }
});
test("denied or failed throttling never verifies credentials or creates sessions", async () => {
  for (const allowLogin of [async () => false, async () => { throw new Error("private throttle details"); }]) {
    const data = setup(); data.policy.allowLogin = allowLogin;
    const response = await data.handler()(request({ action: "login", credential: "synthetic" }));
    assert.ok([429, 503].includes(response.status)); assert.deepEqual(data.calls, []);
    assert.equal((await response.text()).includes("private"), false);
  }
});
test("single logout revokes one device and clears the cookie; missing cookies are idempotent", async () => {
  const data = setup(), first = await login(data); await login(data);
  const response = await data.handler()(request({ action: "logout" }, { headers: { cookie: first.cookie } }));
  assert.equal(response.status, 204); assert.equal(data.records.size, 1);
  assert.equal(response.headers.get("set-cookie").includes("Max-Age=0"), true);
  assert.equal((await data.handler()(request({ action: "logout" }))).status, 204);
});
test("all-device logout uses authenticated owner identity and rejects caller-supplied principals", async () => {
  const data = setup(), first = await login(data); await login(data);
  assert.equal((await data.handler()(request({ action: "logout_all", principalId: other }, { headers: { cookie: first.cookie } }))).status, 400);
  assert.equal(data.records.size, 2);
  assert.equal((await data.handler()(request({ action: "logout_all" }, { headers: { cookie: first.cookie } }))).status, 204);
  assert.equal(data.records.size, 0);
  assert.equal((await data.handler()(request({ action: "logout_all" }))).status, 401);
});
test("method/origin/content/body checks prevent login work, including oversized and forged grants", async () => {
  for (const [body, options, status] of [[{ action: "login", credential: "synthetic" }, { method: "GET" }, 405],
    [{ action: "login", credential: "synthetic" }, { headers: { origin: "https://foreign.example" } }, 403],
    [{ action: "login", credential: "synthetic" }, { headers: { "content-type": "text/plain" } }, 415],
    [{ action: "login", credential: "synthetic", permission: "write" }, {}, 400],
    [{ action: "login", credential: "synthetic" }, { raw: "x".repeat(8193) }, 413],
    [{ action: "login", credential: "bad\ud800" }, {}, 400]]) {
    const data = setup(); assert.equal((await data.handler()(request(body, options))).status, status); assert.deepEqual(data.calls, []);
  }
});
test("provider/store failures expose no private details and do not set a session cookie", async () => {
  for (const part of ["provider", "store"]) {
    const data = setup(); data[part][part === "provider" ? "verify" : "create"] = async () => { throw new Error("private connection details"); };
    const response = await data.handler()(request({ action: "login", credential: "synthetic" }));
    assert.equal(response.status, 503); assert.equal(response.headers.has("set-cookie"), false);
    assert.deepEqual(await response.json(), { error: "session_unavailable" });
  }
});
test("secure origin and a valid configured owner are required", () => {
  for (const change of [{ origin: "http://flaneur.example" }, { origin: "https://u:secret@flaneur.example" },
    { origin: "https://flaneur.example/path" }, { ownerPrincipalId: "bad" }]) {
    const data = setup(); Object.assign(data.policy, change); assert.throws(() => data.handler());
  }
});
test("logout revocation failures do not claim success or clear the cookie; foreign grants cannot revoke all devices", async () => {
  for (const action of ["logout", "logout_all"]) {
    const data = setup(), issued = await login(data);
    data.store[action === "logout" ? "revoke" : "revokeAll"] = async () => { throw new Error("private store detail"); };
    const response = await data.handler()(request({ action }, { headers: { cookie: issued.cookie } }));
    assert.equal(response.status, 503); assert.equal(response.headers.has("set-cookie"), false);
    assert.deepEqual(await response.json(), { error: "session_unavailable" });
  }
  const data = setup(), issued = await login(data);
  for (const record of data.records.values()) record.principalId = other;
  const response = await data.handler()(request({ action: "logout_all" }, { headers: { cookie: issued.cookie } }));
  assert.equal(response.status, 401); assert.equal(data.calls.includes("revokeAll"), false);
});
