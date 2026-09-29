// Runs a TypeScript script against the app code. Usage: node scripts/run-ts.mjs scripts/<name>.ts
// Node 20 cannot execute TypeScript, so bundle it with esbuild (resolving the "@/" alias) and import it.
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const entry = process.argv[2];
if (!entry) throw new Error("usage: node scripts/run-ts.mjs <script.ts>");

// Node's loader keeps the quotes when .env is written as `KEY = "value"`; strip them like drizzle.config.ts does.
process.loadEnvFile(".env");
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const key = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
  const value = key ? process.env[key] : undefined;
  if (key && value) process.env[key] = value.trim().replace(/^"(.*)"$/, "$1");
}

const outfile = resolve("node_modules/.cache/flaneur", `${basename(entry, ".ts")}.mjs`);
await esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  tsconfig: "tsconfig.json",
  logLevel: "error",
});
await import(pathToFileURL(outfile).href);
