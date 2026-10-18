import { randomUUID } from "node:crypto";
import { lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, basename, join, resolve } from "node:path";
import { z } from "zod";

const fail = (code) => Object.assign(new Error(code), { code });
const keys = ["OWNER_PRINCIPAL_ID", "OWNER_PASSWORD_HASH"];
function setting(lines, key) {
  const matches = lines.filter((line) => new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line));
  if (matches.length > 1) throw fail("OWNER_CONFIGURATION_DUPLICATE");
  if (!matches.length) return "";
  const raw = matches[0].slice(matches[0].indexOf("=") + 1).trim();
  if (/^["']/.test(raw)) {
    const match = raw.match(/^(["'])(.*?)\1\s*(?:#.*)?$/);
    if (!match) throw fail("OWNER_CONFIGURATION_INVALID");
    return match[2];
  }
  return raw.split("#", 1)[0].trim();
}

/** Initial enrollment only. No output, environment loading, DB access, or credential arguments. */
export async function enrollOwner(envPath, readPassword, hashPassword) {
  const target = resolve(envPath), lockPath = `${target}.owner-setup.lock`;
  const tempPath = join(dirname(target), `${basename(target)}.owner-setup.${randomUUID()}.local`);
  let lock, temporary = false;
  try {
    try { lock = await open(lockPath, "wx", 0o600); }
    catch (error) { throw fail(error?.code === "EEXIST" ? "OWNER_SETUP_BUSY" : "OWNER_SETUP_IO_FAILED"); }
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw fail("OWNER_ENV_FILE_UNSAFE");
    const original = await readFile(target);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(original), eol = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/), currentHash = setting(lines, keys[1]), currentOwner = setting(lines, keys[0]);
    if (currentHash) throw fail("OWNER_PASSWORD_ALREADY_CONFIGURED");
    if (currentOwner && !z.uuid().safeParse(currentOwner).success) throw fail("OWNER_CONFIGURATION_INVALID");
    const password = await readPassword("New owner password (hidden): ");
    const confirmation = await readPassword("Confirm owner password (hidden): ");
    if (password !== confirmation) throw fail("OWNER_PASSWORD_MISMATCH");
    let hash;
    try { hash = await hashPassword(password); }
    catch (error) {
      // Validation and cryptographic failures have different remedies. Never forward raw details.
      throw fail(error instanceof Error && error.message === "PASSWORD_ENROLLMENT_INVALID"
        ? "OWNER_PASSWORD_ENROLLMENT_INVALID" : "OWNER_PASSWORD_HASH_UNAVAILABLE");
    }
    if (typeof hash !== "string" || !/^flaneur-scrypt-v1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/.test(hash))
      throw fail("OWNER_HASH_INVALID");
    const values = { OWNER_PRINCIPAL_ID: currentOwner ? currentOwner.toLowerCase() : randomUUID(), OWNER_PASSWORD_HASH: hash };
    for (const key of keys) {
      // Next.js expands $VARIABLE in .env; the hash's literal separators must survive loading.
      const encodedValue = values[key].replace(/\$/g, "\\$");
      const index = lines.findIndex((line) => new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line));
      if (index >= 0) lines[index] = `${key}="${encodedValue}"`;
      else { if (lines.at(-1) === "") lines.pop(); lines.push(`${key}="${encodedValue}"`, ""); }
    }
    const encoded = Buffer.from(lines.join(eol), "utf8");
    const output = original.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
      ? Buffer.concat([original.subarray(0, 3), encoded]) : encoded;
    const temporaryFile = await open(tempPath, "wx", 0o600); temporary = true;
    try { await temporaryFile.writeFile(output); await temporaryFile.sync(); } finally { await temporaryFile.close(); }
    if (!(await readFile(target)).equals(original)) throw fail("OWNER_CONFIGURATION_CHANGED");
    const latestStat = await lstat(target);
    if (!latestStat.isFile() || latestStat.isSymbolicLink() || latestStat.ino !== stat.ino) throw fail("OWNER_ENV_FILE_UNSAFE");
    await rename(tempPath, target); temporary = false;
    return { status: "owner_password_configured", password_printed: false, hash_printed: false, database_modified: false };
  } catch (error) {
    if (typeof error?.code === "string" && error.code.startsWith("OWNER_")) throw error;
    throw fail("OWNER_SETUP_IO_FAILED");
  } finally {
    if (temporary) await unlink(tempPath).catch(() => {});
    if (lock) { await lock.close().catch(() => {}); await unlink(lockPath).catch(() => {}); }
  }
}
