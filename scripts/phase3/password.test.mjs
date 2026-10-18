import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["lib/session/password.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { createOwnerPasswordHash, ownerPasswordProvider } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", synthetic = "  synthetic long password 😀  ";
test("salted password hashing produces distinct fixed-profile records without plaintext", async () => {
  const first = await createOwnerPasswordHash(synthetic), second = await createOwnerPasswordHash(synthetic);
  assert.equal(first === second, false); assert.equal(first.includes(synthetic), false);
  assert.equal(first.split("$").length, 3);
});
test("verification grants only the configured owner and preserves exact whitespace and Unicode", async () => {
  const passwordHash = await createOwnerPasswordHash(synthetic), provider = ownerPasswordProvider({ ownerPrincipalId: owner, passwordHash });
  assert.deepEqual(await provider.verify(synthetic), { principalId: owner, permission: "write" });
  assert.equal(await provider.verify(synthetic.trim()), null); assert.equal(await provider.verify("incorrect long password"), null);
});
test("malformed, unsupported and noncanonical password records fail at configuration", () => {
  for (const passwordHash of ["plain password", "flaneur-scrypt-v2$bad$bad", "x".repeat(101),
    `flaneur-scrypt-v1$${"_".repeat(22)}$${"_".repeat(43)}`])
    assert.throws(() => ownerPasswordProvider({ ownerPrincipalId: owner, passwordHash }), /CONFIGURATION_INVALID/);
});
test("enrollment rejects short, oversized, NUL and malformed Unicode input without coercion", async () => {
  for (const password of [null, "short", "x".repeat(1025), "x".repeat(20) + "\0", "x".repeat(20) + "\ud800"])
    await assert.rejects(createOwnerPasswordHash(password), /ENROLLMENT_INVALID/);
});
test("invalid credentials return no owner grant", async () => {
  const provider = ownerPasswordProvider({ ownerPrincipalId: owner, passwordHash: await createOwnerPasswordHash(synthetic) });
  for (const value of ["", "x".repeat(1025), "bad\0credential", "bad\ud800credential"])
    assert.equal(await provider.verify(value), null);
});
