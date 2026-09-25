// Builds the extension into extension/dist. Usage: node extension/build.mjs [--watch]
import * as esbuild from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const outdir = `${dir}dist`;
const watch = process.argv.includes("--watch");

// host_permissions must name the API origin, which lives in the gitignored config.ts.
async function appOrigin() {
  const result = await esbuild.build({
    entryPoints: [`${dir}config.ts`],
    bundle: true,
    format: "esm",
    write: false,
  });
  const source = result.outputFiles[0].text;
  const config = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  return new URL(config.APP_URL).origin;
}

async function writeManifest() {
  const manifest = JSON.parse(await readFile(`${dir}manifest.json`, "utf8"));
  manifest.host_permissions = [`${await appOrigin()}/*`];
  await mkdir(outdir, { recursive: true });
  await writeFile(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2));
}

const shared = { bundle: true, target: "chrome120", outdir, logLevel: "info" };
const builds = [
  // Content scripts cannot be ES modules.
  { ...shared, entryPoints: { content: `${dir}content/index.ts` }, format: "iife" },
  { ...shared, entryPoints: { background: `${dir}background.ts` }, format: "esm" },
];

await writeManifest();
if (watch) {
  for (const options of builds) await (await esbuild.context(options)).watch();
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
