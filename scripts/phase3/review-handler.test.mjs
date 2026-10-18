import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["lib/review/handler.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { reviewHandler } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
async function load(path) {
  const output = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);
}
const { ownerReviewHandler } = await load("lib/review/owner-handler.ts");
const { ownerSessionRuntime } = await load("lib/session/owner-runtime.ts");
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", target = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const base = { action: "confirm_observation", payload: { requestId: id, observationId: target } };
function setup() {
  const calls = [];
  const tx = { confirmationReceipt: async () => null, correctionReceipt: async () => null, receipt: async () => null,
    observation: async () => ({ active: true, identityProof: false, layer: "inferred", bodyText: "Stored words" }),
    available: async () => true, archive: async () => "2026-10-12T00:00:00.000Z",
    snapshot: async () => ({ kind: "profile_page", adapterId: "linkedin", contentHash: "a".repeat(64), sourceUrl: "https://www.linkedin.com/in/fixture/" }),
    confirmation: async () => null, canonicalPerson: async () => true, currentProof: async () => null,
    noticedPeople: async () => [], activeProofIds: async () => [target],creationReceipt:async()=>null,sourceNeutralPeople:async()=>true };
  for (const method of ["insertConfirmationReplacement", "insertConfirmationReview", "insertReplacement", "insertCorrectionReview",
    "insertReview", "invalidate", "insertReceipt", "insertProof", "linkPerson", "queueParse", "createPerson", "insertReassignment", "replacePersonLink"])
    tx[method] = async () => { calls.push(method); };
  const store = { async transaction(id, work) { calls.push("transaction"); return work(tx); } };
  const deps = { observations: store, observationArchive: store, personArchive: store, identities: store, identityRejection: store,personCreation:store,
    identityReassignment:{transaction:(id,people,work)=>store.transaction(id,work)} };
  return { calls, tx, store, handler: reviewHandler(deps, { origin: "https://flaneur.example", authorize: () => true }), deps };
}
function request(body = base, options = {}) {
  const method = options.method ?? "POST";
  return new Request("https://flaneur.example/api/review", { method,
    headers: { origin: "https://flaneur.example", "content-type": "application/json", ...options.headers },
    ...(method === "GET" ? {} : { body: options.raw ?? JSON.stringify(body) }) });
}

function ownerRuntime(grant, unavailable = false) {
  const sessions = { async lookup() { if (unavailable) throw new Error("SYNTHETIC_PRIVATE_AUTH_ERROR"); return grant; },
    async create() { throw new Error("UNEXPECTED_LOGIN"); }, async revoke() {}, async revokeAll() {} };
  return ownerSessionRuntime({ sessions, throttle: { consume: async () => false } }, {
    origin: "https://flaneur.example", ownerPrincipalId: id,
    passwordHash: `flaneur-scrypt-v1$${Buffer.alloc(16, 1).toString("base64url")}$${Buffer.alloc(32, 2).toString("base64url")}`,
  });
}
const cookie = `__Host-flaneur-session=${Buffer.alloc(32, 3).toString("base64url")}`;
test("owner review composition rejects read, foreign-owner and unavailable sessions before any mutation", async () => {
  for (const [grant, unavailable, status] of [[{ principalId: id, permission: "read" }, false, 401],
    [{ principalId: target, permission: "write" }, false, 401], [null, false, 401], [null, true, 503]]) {
    const data = setup(), handler = ownerReviewHandler(data.deps, ownerRuntime(grant, unavailable), "https://flaneur.example");
    const response = await handler(request({}, { raw: "not JSON", headers: { cookie } }));
    assert.equal(response.status, status); assert.deepEqual(data.calls, []);
    assert.equal((await response.text()).includes("PRIVATE"), false);
  }
});
test("owner write session reaches the reviewed service and retains exact-origin checks", async () => {
  const data = setup(), handler = ownerReviewHandler(data.deps, ownerRuntime({ principalId: id, permission: "write" }), "https://flaneur.example");
  assert.equal((await handler(request(base, { headers: { cookie, origin: "https://foreign.example" } }))).status, 403);
  assert.deepEqual(data.calls, []);
  const response = await handler(request(base, { headers: { cookie } }));
  assert.equal(response.status, 200); assert.ok(data.calls.includes("insertConfirmationReview"));
});
test("legacy capture credentials do not reach review stores even with an otherwise valid owner grant", async () => {
  const data = setup(), handler = ownerReviewHandler(data.deps, ownerRuntime({ principalId: id, permission: "write" }), "https://flaneur.example");
  assert.equal((await handler(request(base, { headers: { cookie: "x-capture-secret=synthetic", "x-capture-secret": "synthetic" } }))).status, 401);
  assert.deepEqual(data.calls, []);
});
test("all seven actions dispatch to their explicit service with private response headers", async () => {
  for (const action of ["confirm_observation", "correct_observation", "reject_observation", "archive_observation", "archive_person", "confirm_identity", "reject_identity"]) {
    const data = setup(); const payload = action === "archive_person" ? { requestId: id, personId: target } :
      action === "confirm_identity" ? { requestId: id, personId: target, snapshotId: id } :
      action === "reject_identity" ? { requestId: id, observationId: target, snapshotId: id } :
      { requestId: id, observationId: target, ...(action === "correct_observation" ? { bodyText: "My correction" } : {}) };
    const response = await data.handler(request({ action, payload }));
    assert.equal(response.status, 200, action); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff"); assert.ok(data.calls.includes("transaction"));
    const expected = { confirm_observation: "insertConfirmationReview", correct_observation: "insertCorrectionReview",
      reject_observation: "insertReview", archive_observation: "insertReceipt", archive_person: "insertReceipt",
      confirm_identity: "insertProof", reject_identity: "queueParse" };
    assert.ok(data.calls.includes(expected[action]), action);
  }
});
test("authorization rejection and failure never read the body or call a store", async () => {
  for (const authorize of [() => false, async () => { throw new Error("private auth failure"); }]) {
    const data = setup(), handler = reviewHandler(data.deps, { origin: "https://flaneur.example", authorize });
    const response = await handler(request({}, { raw: "bad JSON" }));
    assert.ok([401, 503].includes(response.status)); assert.deepEqual(data.calls, []);
    assert.ok(!(await response.text()).includes("private"));
  }
});
test("method, cross-site origin and content type checks precede mutation", async () => {
  for (const [options, status] of [[{ method: "GET" }, 405], [{ headers: { origin: "https://foreign.example" } }, 403],
    [{ headers: { origin: "null" } }, 403], [{ headers: { "content-type": "text/plain" } }, 415]]) {
    const data = setup(); assert.equal((await data.handler(request(base, options))).status, status); assert.deepEqual(data.calls, []);
  }
  const data = setup(), missing = request(); missing.headers.delete("origin");
  assert.equal((await data.handler(missing)).status, 403); assert.deepEqual(data.calls, []);
});
test("invalid JSON, oversized bodies and invalid actions cannot call a store", async () => {
  for (const [body, options, status] of [[base, { raw: "bad JSON" }, 400], [base, { raw: "x".repeat(144001) }, 413],
    [{ ...base, action: "invented" }, {}, 400], [{ ...base, extra: true }, {}, 400]]) {
    const data = setup(); assert.equal((await data.handler(request(body, options))).status, status); assert.deepEqual(data.calls, []);
  }
});
test("service validation rejects changed shape and text injection before mutation", async () => {
  for (const payload of [{ requestId: "bad", observationId: target }, { ...base.payload, bodyText: "invented confirmation" }]) {
    const data = setup(); assert.equal((await data.handler(request({ ...base, payload }))).status, 400); assert.deepEqual(data.calls, []);
  }
});
test("stable conflict errors are distinct and driver details never enter responses", async () => {
  for (const [message, status, code] of [["REVIEW_REQUEST_CONFLICT", 409, "request_conflict"],
    ["IDENTITY_REVIEW_REQUIRED", 409, "identity_review_required"], ["IDENTITY_CAPTURE_UNAVAILABLE",409,"review_target_unavailable"], ["private SQL connection detail", 503, "review_unavailable"]]) {
    const data = setup(); data.store.transaction = async () => { throw new Error(message); };
    const response = await data.handler(request()); assert.equal(response.status, status); assert.deepEqual(await response.json(), { error: code });
  }
});
test("invalid configured origins fail at factory creation", () => {
  for (const origin of ["bad", "http://flaneur.example", "https://user:secret@flaneur.example", "https://flaneur.example/path", "file:///", "https://flaneur.example?key=secret"])
    assert.throws(() => reviewHandler(setup().deps, { origin, authorize: () => true }));
});
test("streamed input uses actual bytes and rejects malformed UTF-8 without mutation", async () => {
  const data = setup();
  const malformed = new Request("https://flaneur.example/api/review", { method: "POST",
    headers: { origin: "https://flaneur.example", "content-type": "application/json" }, body: new Uint8Array([0xff]) });
  assert.equal((await data.handler(malformed)).status, 400); assert.deepEqual(data.calls, []);
  let canceled = false;
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(72001)); controller.enqueue(new Uint8Array(72001));
  }, cancel() { canceled = true; } });
  const oversized = new Request("https://flaneur.example/api/review", { method: "POST", duplex: "half",
    headers: { origin: "https://flaneur.example", "content-type": "application/json", "content-length": "1" }, body: stream });
  assert.equal((await data.handler(oversized)).status, 413); assert.equal(canceled, true); assert.deepEqual(data.calls, []);
});
test("maximum valid escaped authored text fits within the byte boundary", async () => {
  const data = setup(); const response = await data.handler(request({ action: "correct_observation",
    payload: { ...base.payload, bodyText: "\u0001".repeat(19999) + "x", comment: "\u0001".repeat(2000) } }));
  assert.equal(response.status, 200); assert.ok(data.calls.includes("insertCorrectionReview"));
});
test('Person creation uses the owner review boundary and fails closed when the schema is not ready',async()=>{
 const data=setup(),body={action:'create_person_from_profile',payload:{requestId:id,snapshotId:target,name:'Ada'}};
 data.tx.sourceNeutralPeople=async()=>false;
 const blocked=await data.handler(request(body));assert.equal(blocked.status,503);assert.deepEqual(await blocked.json(),{error:'person_creation_not_ready'});
 assert.equal(data.calls.includes('createPerson'),false);
 data.calls.length=0;data.tx.sourceNeutralPeople=async()=>true;
 assert.equal((await data.handler(request(body,{headers:{origin:'https://foreign.test'}}))).status,403);assert.deepEqual(data.calls,[]);
 assert.equal((await data.handler(request(body))).status,200);assert.ok(data.calls.includes('createPerson'));assert.ok(data.calls.includes('queueParse'));
});
test('reassignment requires owner authorization, exact origin and the current expected proof before writing',async()=>{
 const data=setup(),body={action:'reassign_identity',payload:{requestId:id,snapshotId:target,fromObservationId:id,fromPersonId:id,personId:target,reason:'  Correction 😀  '}};
 const unauthorized=reviewHandler(data.deps,{origin:'https://flaneur.example',authorize:()=>false});
 assert.equal((await unauthorized(request(body))).status,401);assert.deepEqual(data.calls,[]);
 assert.equal((await data.handler(request(body,{headers:{origin:'https://foreign.test'}}))).status,403);assert.deepEqual(data.calls,[]);
 assert.equal((await data.handler(request(body))).status,409);assert.equal(data.calls.includes('insertReassignment'),false);
 data.tx.currentProof=async()=>({id,personId:id});data.tx.noticedPeople=async()=>[id];
 assert.equal((await data.handler(request(body))).status,200);assert.ok(data.calls.includes('insertReassignment'));assert.ok(data.calls.includes('replacePersonLink'));
});
