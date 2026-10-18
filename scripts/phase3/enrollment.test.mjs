import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, readdir, rm, open, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { enrollOwner } from "../auth/enrollment.mjs";
import { build } from "esbuild";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const hash = `flaneur-scrypt-v1$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(32).toString("base64url")}`;
const synthetic = "Synthetic enrollment password";
async function fixture(work) {
  const root = resolve(tmpdir()), directory = await mkdtemp(join(root, "flaneur-owner-enrollment-"));
  const path = join(directory, ".env");
  try { return await work({ path, directory }); }
  finally {
    // Verify the exact temporary directory before recursive cleanup on Windows.
    assert.equal(dirname(resolve(directory)), root);
    assert.equal(basename(directory).startsWith("flaneur-owner-enrollment-"), true);
    await rm(directory, { recursive: true, force: true });
  }
}
const readPassword = async () => synthetic;
test("initial enrollment preserves unrelated settings, CRLF/BOM and never stores plaintext", async () => fixture(async ({ path, directory }) => {
  const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('DIRECT_URL="synthetic-placeholder"\r\n# Keep this comment\r\n')]);
  await writeFile(path, original);
  const result = await enrollOwner(path, readPassword, async () => hash);
  const output = await readFile(path);
  assert.equal(output.subarray(0, original.length).equals(original), true);
  assert.equal(output.toString().includes(synthetic), false);
  assert.equal(output.toString().includes("OWNER_PASSWORD_HASH="), true);
  assert.equal(result.password_printed || result.hash_printed || result.database_modified, false);
  assert.deepEqual(await readdir(directory), [".env"]);
}));
test("a configured owner is retained; initial hash enrollment refuses silent password rotation", async () => fixture(async ({ path }) => {
  await writeFile(path, `OWNER_PRINCIPAL_ID="${owner}"\nOWNER_PASSWORD_HASH=""\n`);
  await enrollOwner(path, readPassword, async () => hash);
  const before = await readFile(path); assert.equal(before.toString().includes(owner), true);
  let prompted = false;
  await assert.rejects(enrollOwner(path, async () => { prompted = true; return synthetic; }, async () => hash), /ALREADY_CONFIGURED/);
  assert.equal(prompted, false); assert.equal((await readFile(path)).equals(before), true);
}));
test("mismatched confirmation, invalid enrollment and invalid hash leave settings unchanged", async () => fixture(async ({ path, directory }) => {
  const original = Buffer.from("OTHER_SETTING=unchanged\n"); await writeFile(path, original);
  let prompts = 0;
  await assert.rejects(enrollOwner(path, async () => ++prompts === 1 ? synthetic : "different", async () => hash), /MISMATCH/);
  await assert.rejects(enrollOwner(path, readPassword, async () => { throw new Error("PASSWORD_ENROLLMENT_INVALID"); }), /ENROLLMENT_INVALID/);
  await assert.rejects(enrollOwner(path, readPassword, async () => "unsafe\nINJECTED=value"), /HASH_INVALID/);
  assert.equal((await readFile(path)).equals(original), true); assert.deepEqual(await readdir(directory), [".env"]);
}));
test("hashing failures are distinguished from rejected passwords without private details or file changes", async () => fixture(async ({ path, directory }) => {
  const original = Buffer.from("OTHER_SETTING=unchanged\n"); await writeFile(path, original);
  for (const failure of [new Error("PASSWORD_HASH_UNAVAILABLE"), new Error("SYNTHETIC_PRIVATE_CRYPTO_DETAILS")]) {
    await assert.rejects(enrollOwner(path, readPassword, async () => { throw failure; }),
      { message: "OWNER_PASSWORD_HASH_UNAVAILABLE", code: "OWNER_PASSWORD_HASH_UNAVAILABLE" });
    assert.equal((await readFile(path)).equals(original), true);
    assert.deepEqual(await readdir(directory), [".env"]);
  }
}));
test("duplicate or invalid owner configuration fails before password prompts", async () => fixture(async ({ path }) => {
  for (const input of ["OWNER_PRINCIPAL_ID=bad\n", "OWNER_PASSWORD_HASH=\nOWNER_PASSWORD_HASH=\n", "OWNER_PASSWORD_HASH=\"unterminated\n"]) {
    await writeFile(path, input); let prompted = false;
    await assert.rejects(enrollOwner(path, async () => { prompted = true; return synthetic; }, async () => hash), /CONFIGURATION/);
    assert.equal(prompted, false); assert.equal((await readFile(path, "utf8")) === input, true);
  }
}));
test("concurrent file edits are retained and temporary credentials are cleaned up", async () => fixture(async ({ path, directory }) => {
  await writeFile(path, "OTHER_SETTING=original\n");
  await assert.rejects(enrollOwner(path, readPassword, async () => { await writeFile(path, "OTHER_SETTING=user-edit\n"); return hash; }), /CONFIGURATION_CHANGED/);
  assert.equal((await readFile(path, "utf8")) === "OTHER_SETTING=user-edit\n", true);
  assert.deepEqual(await readdir(directory), [".env"]);
}));
test("setup lock prevents simultaneous enrollment and unsafe file types are rejected", async () => fixture(async ({ path, directory }) => {
  await writeFile(path, "OTHER_SETTING=original\n");
  const lock = await open(`${path}.owner-setup.lock`, "wx");
  try { await assert.rejects(enrollOwner(path, readPassword, async () => hash), /SETUP_BUSY/); }
  finally { await lock.close(); await rm(`${path}.owner-setup.lock`); }
  const unsafe = join(directory, "directory.env"); await mkdir(unsafe);
  await assert.rejects(enrollOwner(unsafe, readPassword, async () => hash), /ENV_FILE_UNSAFE/);
}));
test("real password enrollment survives Next's env expansion and verifies the synthetic password", async () => fixture(async ({ path, directory }) => {
  const bundle = await build({ entryPoints: ["lib/session/password.ts"], bundle: true, write: false, platform: "node", format: "esm" });
  const { createOwnerPasswordHash, ownerPasswordProvider } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
  await writeFile(path, "OTHER_SETTING=unchanged\n");
  await enrollOwner(path, readPassword, createOwnerPasswordHash);
  const raw = await readFile(path, "utf8");
  const passwordHash = raw.match(/^OWNER_PASSWORD_HASH="(.*)"$/m)[1].replaceAll("\\$", "$");
  const principal = raw.match(/^OWNER_PRINCIPAL_ID="(.*)"$/m)[1];
  assert.equal((await ownerPasswordProvider({ ownerPrincipalId: principal, passwordHash }).verify(synthetic))?.permission, "write");
  const modulePath = pathToFileURL(resolve("node_modules/@next/env/dist/index.js")).href;
  const code = String.raw`import { readFileSync } from 'node:fs';
    const lib = await import(process.argv[1]);
    const load = lib.loadEnvConfig ?? lib.default.loadEnvConfig;
    const raw = readFileSync(process.argv[2] + '/.env', 'utf8');
    const expected = raw.match(/^OWNER_PASSWORD_HASH="(.*)"$/m)[1].replaceAll("\\$", "$");
    const { combinedEnv } = load(process.argv[2], true, { info() {}, error() {} }, true);
    console.log(combinedEnv.OWNER_PASSWORD_HASH === expected);`;
  const env = Object.fromEntries(["SystemRoot", "PATH", "TEMP", "TMP"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  const result = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", code, modulePath, directory], { env });
  assert.equal(result.stdout.trim(), "true"); assert.equal(result.stderr, "");
}));
