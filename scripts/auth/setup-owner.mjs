import { build } from "esbuild";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { enrollOwner } from "./enrollment.mjs";

// Run locally in the user's terminal. Never receive a password through chat, argv, or environment.
let terminal;
try {
  if (process.argv.length !== 2) throw Object.assign(new Error("No arguments"), { code: "OWNER_SETUP_ARGUMENTS_NOT_ALLOWED" });
  if (!process.stdin.isTTY || !process.stderr.isTTY) throw Object.assign(new Error("Terminal required"), { code: "OWNER_SETUP_TTY_REQUIRED" });
  const outfile = resolve("node_modules/.cache/flaneur/owner-password.mjs");
  await build({ entryPoints: ["lib/session/password.ts"], outfile, bundle: true, platform: "node", format: "esm", logLevel: "silent" });
  const { createOwnerPasswordHash } = await import(pathToFileURL(outfile).href);
  process.stderr.write("Use at least 15 characters (maximum 1,024 UTF-16 units). Input is hidden; spaces are preserved.\n");
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  terminal = createInterface({ input: process.stdin, output: muted, terminal: true, historySize: 0 });
  function readPassword(prompt) {
    process.stderr.write(prompt);
    return new Promise((resolveInput, reject) => {
      const cancel = () => { cleanup(); reject(Object.assign(new Error("Canceled"), { code: "OWNER_SETUP_CANCELLED" })); terminal.close(); };
      const cleanup = () => { terminal.off("SIGINT", cancel); terminal.off("close", cancel); };
      terminal.once("SIGINT", cancel); terminal.once("close", cancel);
      terminal.question("", (value) => { cleanup(); process.stderr.write("\n"); resolveInput(value); });
    });
  }
  console.log(JSON.stringify(await enrollOwner(resolve(".env"), readPassword, createOwnerPasswordHash)));
} catch (error) {
  const code = typeof error?.code === "string" && /^OWNER_[A-Z0-9_]+$/.test(error.code) ? error.code : "OWNER_SETUP_FAILED";
  const hints = {
    OWNER_PASSWORD_ENROLLMENT_INVALID: "Use at least 15 Unicode characters, at most 1,024 UTF-16 units, and no NUL or malformed Unicode. Retry auth:setup; no password was saved.",
    OWNER_PASSWORD_MISMATCH: "The two entries differed. Retry auth:setup and enter the same password twice; no password was saved.",
    OWNER_PASSWORD_HASH_UNAVAILABLE: "Password hashing failed. Retry auth:setup; no password was saved. If this repeats, report this code without the password.",
  };
  console.error(JSON.stringify({ status: "failed", code, ...(hints[code] ? { hint: hints[code] } : {}) })); process.exitCode = 1;
} finally { terminal?.close(); }
