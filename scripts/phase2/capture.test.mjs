import assert from "node:assert/strict";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { build } from "esbuild";

async function load(path) {
  const built = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString("base64")}`);
}
const { saveCaptureV2 } = await load("lib/capture/v2-save.ts");
const { captureV2Handler } = await load("lib/capture/v2-handler.ts");
const { captureV2 } = await load("lib/capture/v2-contract.ts");
const body = () => ({ version: 2, requestId: crypto.randomUUID(), adapterId: "linkedin", kind: "profile_page",
  sourceUrl: "https://www.linkedin.com/in/example/", html: "<main>Captured source</main>",
  reasonForNoticing: "Why I noticed this", urn: null, extensionVersion: "0.2.0",
  clientCapturedAt: "2026-10-11T12:00:00.000Z" });
function store() {
  const state = { captures: new Map(), fail: false }; let pending = Promise.resolve();
  return { state, transaction(_id, work) {
    const next = pending.then(async () => {
      const captures = new Map(state.captures);
      const output = await work({ async findRequest(id) {
        const c = captures.get(id); return c ? { payloadHash: c.payloadHash,
          snapshotId: c.snapshotId, encounterId: c.encounterId, processing: c.processing } : null;
      }, async storeCapture(c) {
        captures.set(c.body.requestId, { ...c, processing: "queued" });
        if (state.fail) throw new Error("simulated transaction failure");
      } });
      state.captures = captures; return output;
    }); pending = next.catch(() => {}); return next;
  } };
}
test("save durably retains raw source, attention, explicit user reason, and queued work", async () => {
  const target = store(); const payload = body(); const acknowledgment = await saveCaptureV2(target, payload);
  const capture = target.state.captures.get(payload.requestId);
  assert.equal(acknowledgment.state, "saved"); assert.equal(acknowledgment.processing, "queued");
  assert.equal(gunzipSync(capture.contentGzip).toString("utf8"), payload.html);
  assert.ok(capture.reasonId); assert.ok(capture.jobId); assert.equal(capture.body.reasonForNoticing, payload.reasonForNoticing);
});
test("concurrent delivery retries create exactly one capture and encounter", async () => {
  const target = store(); const payload = body();
  const replies = await Promise.all([saveCaptureV2(target, payload), saveCaptureV2(target, payload)]);
  assert.equal(target.state.captures.size, 1); assert.equal(replies[0].snapshotId, replies[1].snapshotId);
  assert.equal(replies[0].encounterId, replies[1].encounterId); assert.equal(replies[1].replayed, true);
});
test("new intentional save retains independent attention even for identical HTML", async () => {
  const target = store(); const payload = body(); const first = await saveCaptureV2(target, payload);
  const second = await saveCaptureV2(target, { ...payload, requestId: crypto.randomUUID() });
  assert.equal(target.state.captures.size, 2); assert.notEqual(first.encounterId, second.encounterId);
});
test("request ID reuse with altered user text cannot overwrite original capture", async () => {
  const target = store(); const payload = body(); await saveCaptureV2(target, payload);
  await assert.rejects(saveCaptureV2(target, { ...payload, reasonForNoticing: "Changed" }), /PAYLOAD_CONFLICT/);
  assert.equal(target.state.captures.get(payload.requestId).body.reasonForNoticing, payload.reasonForNoticing);
});
test("failed transaction creates no acknowledgment or partial capture", async () => {
  const target = store(); target.state.fail = true;
  await assert.rejects(saveCaptureV2(target, body()), /transaction failure/); assert.equal(target.state.captures.size, 0);
});
test("a replay reports actual current processing state", async () => {
  const target = store(); const payload = body(); await saveCaptureV2(target, payload);
  target.state.captures.get(payload.requestId).processing = "quarantined";
  assert.equal((await saveCaptureV2(target, payload)).processing, "quarantined");
});
test("missing user reason does not invent one", async () => {
  const target = store(); const payload = { ...body(), reasonForNoticing: null }; await saveCaptureV2(target, payload);
  assert.equal(target.state.captures.get(payload.requestId).reasonId, null);
});
test("capture validation rejects credential URLs, unsupported adapters, and excessive UTF-8 bytes", () => {
  assert.equal(captureV2.safeParse({ ...body(), sourceUrl: "https://user:password@linkedin.com/in/example" }).success, false);
  assert.equal(captureV2.safeParse({ ...body(), adapterId: "unimplemented" }).success, false);
  assert.equal(captureV2.safeParse({ ...body(), html: "😀".repeat(2_500_001) }).success, false);
});
test("handler authenticates before reading a private body", async () => {
  let read = false;
  const request = { headers: new Headers(), get body() { read = true; throw new Error("must not read"); } };
  const response = await captureV2Handler(store(), () => false)(request);
  assert.equal(response.status, 401); assert.equal(read, false);
});
test("handler exposes durable save, conflict, and temporary failure without private error details", async () => {
  const target = store(); const handler = captureV2Handler(target, () => true); const payload = body();
  const request = (data) => new Request("https://example.test/api/capture", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify(data) });
  assert.equal((await handler(request(payload))).status, 200);
  assert.equal((await handler(request({ ...payload, html: "different" }))).status, 409);
  target.state.fail = true; const failure = await handler(request(body()));
  assert.equal(failure.status, 503); assert.deepEqual(await failure.json(), { error: "capture_unavailable" });
});
