import { build } from "esbuild";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import nextEnv from "@next/env";

try {
  if (process.argv.length !== 2) throw new Error("No arguments");
  // Next expansion restores the escaped dollar separators written by auth:setup.
  // Suppress its logger: environment parse errors can otherwise expose private values.
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const outfile = resolve("node_modules/.cache/flaneur/owner-runtime.mjs");
  await build({ entryPoints: ["lib/session/owner-runtime.ts"], outfile, bundle: true, platform: "node", format: "esm", logLevel: "silent" });
  const { ownerSessionReadiness } = await import(pathToFileURL(outfile).href);
  console.log(JSON.stringify({ status: "owner_configuration_checked", ...ownerSessionReadiness(process.env),
    loginRouteIntegrated: existsSync(resolve("app/api/session/route.ts")), deploymentChecked: false, databaseChecked: false }));
} catch {
  console.error(JSON.stringify({ status: "failed", code: "OWNER_STATUS_FAILED" })); process.exitCode = 1;
}
