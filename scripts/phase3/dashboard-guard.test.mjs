import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["lib/session/dashboard-guard.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { dashboardRequestGuard } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const origin = "https://example.test";
const request = (method, headers = {}) => new Request(origin, { method, headers });
test("dashboard reads require read permission; all non-read methods require write and exact origin", async () => {
  const permissions = [], owner = { async authorize(_request, required) { permissions.push(required); return true; } };
  for (const method of ["GET", "HEAD", "POST", "PATCH", "DELETE"])
    assert.equal(await dashboardRequestGuard(request(method, { origin }), owner, origin), null);
  assert.deepEqual(permissions, ["read", "read", "write", "write", "write"]);
});
test("cross-origin, sibling-site and missing mutation origin requests are blocked before authorization", async () => {
  let calls = 0; const owner = { async authorize() { calls++; return true; } };
  for (const req of [request("POST"), request("PATCH", { origin: "null" }), request("POST", { origin: "https://foreign.test" }),
    request("GET", { origin: "https://foreign.test" }), request("GET", { "sec-fetch-site": "cross-site" }),
    request("POST", { origin, "sec-fetch-site": "same-site" })]) {
    const response = await dashboardRequestGuard(req, owner, origin); assert.equal(response.status, 403);
  }
  assert.equal(calls, 0);
});
test("denials are private and uncached, including storage failure", async () => {
  for (const [authorize, status] of [[async () => false, 401], [async () => { throw new Error("SYNTHETIC_PRIVATE_DRIVER_DATA"); }, 503]]) {
    const response = await dashboardRequestGuard(request("GET"), { authorize }, origin);
    assert.equal(response.status, status); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.text()).includes("PRIVATE"), false);
  }
});
test("missing and unsafe server origins fail closed before session checks", async () => {
  const owner = { async authorize() { throw new Error("UNEXPECTED_AUTHORIZATION"); } };
  for (const value of ["", "http://example.test", "https://user:private@example.test", `${origin}/path`, `${origin}?query=private`])
    assert.equal((await dashboardRequestGuard(request("GET"), owner, value)).status, 503);
});
