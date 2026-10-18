import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
async function load(path) {
  const bundle = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
}
const { memoryExportHandler } = await load("lib/export/handler.ts");
const { notebookDownload, DOWNLOAD_MAX_BYTES } = await load("lib/export/download.ts");
const { EXPORT_TABLES, EXPORT_WALK_CATALOG } = await load("lib/export/v2.ts");
const { issueSession, SESSION_COOKIE_V2 } = await load("lib/session/service.ts");
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
async function setup(permission = "read", principalId = owner, withWalk = false) {
  let exports = 0; const records = new Map();
  const sessions = { async create(record) { records.set(record.tokenHash, record); return { expiresAt: "2026-10-19T00:00:00Z" }; },
    async lookup(hash) { const r = records.get(hash); return r ? { principalId: r.principalId, permission: r.permission } : null; },
    async revoke(hash) { records.delete(hash); }, async revokeAll() { records.clear(); } };
  const issued = await issueSession({ principalId, permission }, sessions);
  const source = { async transaction(work) { exports++; return work({
    async capturedAt() { return "2026-10-12T00:00:00.123456Z"; },
    async catalog() { return EXPORT_TABLES.map((name) => ({ name, columns: [{ name: "id", type: "uuid", nullable: false },
      { name: "value", type: "text", nullable: true }], primaryKey: ["id"] })).concat(withWalk?EXPORT_WALK_CATALOG:[]); },
    async *rows(table) { if (table.name === "note") yield [owner, "  Synthetic User words 😀  "]; },
  }); } };
  return { sessions, source, issued, exports: () => exports,
    handler: (extra = {}) => memoryExportHandler(source, sessions, { origin: "https://flaneur.example", ownerPrincipalId: owner, ...extra }),
    request: (extra = {}, method = "GET") => new Request("https://flaneur.example/api/export", { method,
      headers: { cookie: `${SESSION_COOKIE_V2}=${issued.token}`, "sec-fetch-site": "same-origin", ...extra } }) };
}
test("Walk exports use a matching v3 attachment filename under the same owner authorization",async()=>{
 const fixture=await setup("read",owner,true),response=await fixture.handler()(fixture.request());
 assert.equal(response.status,200);assert.match(response.headers.get("content-disposition"),/flaneur-memory-v3-/);
 const data=await response.json();assert.equal(data.version,3);assert.equal(data.tables.length,41);
});

test("owner read/write sessions receive a private attachment containing all notebook tables", async () => {
  for (const permission of ["read", "write"]) {
    const data = await setup(permission), response = await data.handler()(data.request());
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="flaneur-memory-v2-2026-10-12.json"');
    const text = await response.text(); assert.equal(Number(response.headers.get("content-length")), Buffer.byteLength(text));
    const body = JSON.parse(text); assert.equal(body.tables.length, 38);
    assert.equal(body.tables.find((t) => t.name === "note").rows[0][1], "  Synthetic User words 😀  ");
    assert.equal(text.includes(data.issued.token), false);
  }
});
test("unknown, malformed, duplicate, foreign-owner and revoked sessions cannot read export data", async () => {
  const foreign = await setup("read", other);
  assert.equal((await foreign.handler()(foreign.request())).status, 401); assert.equal(foreign.exports(), 0);
  const data = await setup();
  for (const cookie of ["", "x-capture-secret=ignored", `${SESSION_COOKIE_V2}=malformed`,
    `${SESSION_COOKIE_V2}=${data.issued.token}; ${SESSION_COOKIE_V2}=${data.issued.token}`])
    assert.equal((await data.handler()(data.request({ cookie }))).status, 401);
  data.sessions.lookup = async () => null;
  assert.equal((await data.handler()(data.request())).status, 401); assert.equal(data.exports(), 0);
});
test("only GET and allowed origin/fetch metadata can start a download", async () => {
  const data = await setup(); assert.equal((await data.handler()(data.request({}, "POST"))).status, 405);
  for (const headers of [{ origin: "https://foreign.example" }, { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site", origin: "https://flaneur.example" }, { "sec-fetch-site": "" }])
    assert.equal((await data.handler()(data.request(headers))).status, 403);
  assert.equal(data.exports(), 0);
  assert.equal((await data.handler()(data.request({ "sec-fetch-site": "none" }))).status, 200);
});
test("export and authentication failures expose stable errors without attachments or private records", async () => {
  for (const stage of ["source", "sessions"]) {
    const data = await setup(); data[stage][stage === "source" ? "transaction" : "lookup"] = async () => { throw new Error("private details"); };
    const response = await data.handler()(data.request()); assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "export_unavailable" }); assert.equal(response.headers.has("content-disposition"), false);
  }
});
test("size-limit failure returns no partial download", async () => {
  const data = await setup(), response = await data.handler({ limits: { maxBytes: 100 } })(data.request());
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "export_size_limit" });
  assert.equal(response.headers.has("content-disposition"), false);
});
test("unreviewed schema aborts instead of falling back to the legacy partial export", async () => {
  const data = await setup(); data.source.transaction = async (work) => work({ async capturedAt() { return "2026-10-12T00:00:00Z"; },
    async catalog() { return []; }, async *rows() {} });
  const response = await data.handler()(data.request()); assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "export_unavailable" });
});
test("invalid configured origins and owners fail before activation", async () => {
  const data = await setup();
  for (const extra of [{ origin: "http://flaneur.example" }, { origin: "https://u:secret@flaneur.example" },
    { origin: "https://flaneur.example/path" }, { ownerPrincipalId: "bad" }]) assert.throws(() => data.handler(extra));
});

test("route composition delivers the reviewed v2 format and excludes operational auth tables", async () => {
  const data = await setup(), handler = notebookDownload(data.source, data.sessions, { origin: "https://flaneur.example", ownerPrincipalId: owner });
  const response = await handler(data.request()), body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.format, "flaneur-memory"); assert.equal(body.version, 2);
  assert.equal(body.tables.length, 38); assert.equal(body.tables.some(table => ["session", "login_throttle"].includes(table.name)), false);
  assert.equal(data.exports(), 1);
});
test("route composition enforces the delivery cap without an attachment or partial/legacy result", async () => {
  assert.equal(DOWNLOAD_MAX_BYTES, 4 * 1024 * 1024);
  const data = await setup(), original = data.source.transaction;
  data.source.transaction = work => original(tx => work({ ...tx,
    async *rows(table) { if (table.name === "note") yield [owner, "x".repeat(DOWNLOAD_MAX_BYTES)]; },
  }));
  const response = await notebookDownload(data.source, data.sessions, { origin: "https://flaneur.example", ownerPrincipalId: owner })(data.request());
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "export_size_limit" });
  assert.equal(response.headers.has("content-disposition"), false);
});
