import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["lib/session/throttle.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { ownerLoginThrottle, validateThrottleAttempt } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
test("all credentials, forwarded addresses and host headers consume the same owner bucket", async () => {
  const attempts = [], allow = ownerLoginThrottle({ async consume(value) { attempts.push(value); return true; } }, { ownerPrincipalId: owner });
  for (const ip of ["127.0.0.1", "untrusted", "other"])
    assert.equal(await allow(new Request("https://example.test", { headers: { "x-forwarded-for": ip, host: ip } })), true);
  assert.deepEqual(attempts[0], attempts[1]); assert.deepEqual(attempts[1], attempts[2]);
  assert.match(attempts[0].bucketKey, /^[0-9a-f]{64}$/);
  assert.equal(attempts[0].maxAttempts, 8); assert.equal(attempts[0].windowSeconds, 900);
});
test("owner keys are canonical and independent", async () => {
  const values = [], store = { async consume(value) { values.push(value); return false; } };
  for (const id of [owner, owner.toUpperCase(), "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"])
    assert.equal(await ownerLoginThrottle(store, { ownerPrincipalId: id })(new Request("https://example.test")), false);
  assert.equal(values[0].bucketKey, values[1].bucketKey); assert.notEqual(values[0].bucketKey, values[2].bucketKey);
});
test("invalid server policies and storage inputs are rejected", () => {
  const store = { consume: async () => true };
  for (const policy of [{ ownerPrincipalId: "bad" }, { ownerPrincipalId: owner, maxAttempts: 0 },
    { ownerPrincipalId: owner, windowSeconds: 59 }, { ownerPrincipalId: owner, maxAttempts: 101 },
    { ownerPrincipalId: owner, windowSeconds: 86401 }, { ownerPrincipalId: owner, ip: "client" }])
    assert.throws(() => ownerLoginThrottle(store, policy));
  assert.throws(() => validateThrottleAttempt({ bucketKey: "bad", maxAttempts: 8, windowSeconds: 900 }));
});
test("store failures propagate to the HTTP handler's unavailable response", async () => {
  const allow = ownerLoginThrottle({ async consume() { throw new Error("SYNTHETIC_UNAVAILABLE"); } }, { ownerPrincipalId: owner });
  await assert.rejects(allow(new Request("https://example.test")), /SYNTHETIC_UNAVAILABLE/);
});
