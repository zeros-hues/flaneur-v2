import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
async function load(path) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}
const { enqueue, drain } = await load("extension/lib/outbox.ts");
const { sendV2 } = await load("extension/lib/v2-delivery.ts");
const { workOne } = await load("lib/processing/worker.ts");
const { inputFingerprint } = await load("lib/processing/fingerprint.ts");
function storage() {
  const items = new Map(); return { items, async list() { return structuredClone([...items.values()]); },
    async put(item) { items.set(item.requestId, structuredClone(item)); }, async remove(id) { items.delete(id); } };
}
test("reload retry uses the same immutable request and source", async () => {
  const target = storage(); const item = await enqueue(target, { html: "original" }, () => "request", 0);
  await drain(target, async (payload) => { payload.html = "changed by transport"; throw new Error("offline"); }, 0);
  assert.equal(target.items.get(item.requestId).payload.html, "original");
  let sent; await drain(target, async (payload) => { sent = payload; return { state: "saved", requestId: payload.requestId }; }, 10_000);
  assert.deepEqual(sent, item.payload); assert.equal(target.items.size, 0);
});
test("two save gestures get separate request IDs, even for identical payloads", async () => {
  const target = storage(); await enqueue(target, { html: "same" }, () => "a", 0);
  await enqueue(target, { html: "same" }, () => "b", 0); assert.equal(target.items.size, 2);
});
test("local storage failure must not report queued", async () => {
  const target = storage(); target.put = async () => { throw new Error("quota"); };
  await assert.rejects(enqueue(target, { html: "retain" }), /quota/); assert.equal(target.items.size, 0);
});
test("authentication failure blocks automatic retries while retaining the private payload", async () => {
  const target = storage(); await enqueue(target, { html: "retain" }, () => "a", 0);
  await drain(target, async () => ({ state: "blocked", code: "AUTH_REJECTED" }), 0);
  await drain(target, async () => { throw new Error("must not retry automatically"); }, 100_000);
  assert.equal(target.items.get("a").state, "blocked"); assert.equal(target.items.get("a").payload.html, "retain");
});
test("wrong acknowledgment ID cannot remove a queued capture", async () => {
  const target = storage(); await enqueue(target, { html: "retain" }, () => "a", 0);
  await drain(target, async () => ({ state: "saved", requestId: "other" }), 0);
  assert.equal(target.items.get("a").lastErrorCode, "ACK_ID_MISMATCH");
});
test("legacy or malformed server success is not a durable v2 acknowledgment", async () => {
  const payload = { requestId: crypto.randomUUID() }; const response = (body, status = 200) => async () => Response.json(body, { status });
  assert.equal((await sendV2(payload, "https://example.test", "secret", response({ summary: "saved" }))).state, "retry");
  assert.equal((await sendV2(payload, "https://example.test", "secret", response({}, 409))).state, "failed");
  assert.equal((await sendV2(payload, "https://example.test", "secret", response({}, 503))).state, "retry");
  for(const status of [404,405])assert.equal((await sendV2(payload,"https://example.test","secret",response({},status))).state,"retry");
  assert.equal((await sendV2(payload, "https://example.test", "secret", response({ version: 2, state: "saved",
    requestId: payload.requestId, snapshotId: crypto.randomUUID(), encounterId: crypto.randomUUID(), processing:"queued",replayed:false }))).state, "saved");
  const ack={version:2,state:"saved",requestId:payload.requestId,snapshotId:crypto.randomUUID(),encounterId:crypto.randomUUID(),processing:"failed",replayed:true};
  assert.equal((await sendV2(payload,"https://example.test","secret",response(ack))).state,"saved");
  for(const malformed of [{...ack,processing:"unknown"},{...ack,replayed:"true"},{...ack,processing:undefined}])
    assert.equal((await sendV2(payload,"https://example.test","secret",response(malformed))).state,"retry");
});
test("expired lease output is fenced out after extraction finishes", async () => {
  let clock = 0; let applied = false;
  const store = { async claim() { return { jobId: "job", token: "lease", expiresAt: 10 }; },
    async complete(lease, _result, _outcome, now) { if (now >= lease.expiresAt) return false; applied = true; return true; },
    async fail() { return false; } };
  const outcome = await workOne(store, async () => { clock = 20; return { result: "stale", outcome: "succeeded" }; }, () => clock);
  assert.equal(outcome, "stale"); assert.equal(applied, false);
});
test("parser/provider failure is a bounded safe code, not a lost capture", async () => {
  let code;
  const store = { async claim() { return { jobId: "job" }; }, async complete() { throw new Error("must not apply"); },
    async fail(_lease, value) { code = value; return true; } };
  assert.equal(await workOne(store, async () => { throw new Error("private payload details"); }), "retry_or_failed");
  assert.equal(code, "PROCESSING_FAILED");
});
test("processing can renew its lease and output failure schedules a safe retry", async () => {
  let renewed = false; let errorCode;
  const store = { async claim() { return { jobId: "job" }; }, async renew() { renewed = true; return true; },
    async complete() { throw new Error("transaction rollback"); }, async fail(_lease, code) { errorCode = code; return true; } };
  const status = await workOne(store, async (_lease, renew) => {
    assert.equal(await renew(), true); return { result: "output", outcome: "succeeded" };
  });
  assert.equal(renewed, true); assert.equal(status, "retry_or_failed"); assert.equal(errorCode, "PROCESSING_FAILED");
});
test("input and version changes invalidate derivations while key ordering does not", () => {
  const original = inputFingerprint({ body: "short", reason: "why" }, { parser: "1", model: "a" });
  assert.equal(inputFingerprint({ reason: "why", body: "short" }, { model: "a", parser: "1" }), original);
  assert.notEqual(inputFingerprint({ body: "richer", reason: "why" }, { parser: "1", model: "a" }), original);
  assert.notEqual(inputFingerprint({ body: "short", reason: "why" }, { parser: "2", model: "a" }), original);
});
