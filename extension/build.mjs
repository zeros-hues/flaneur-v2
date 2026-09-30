// Builds the extension into extension/dist. Usage: node extension/build.mjs [--watch]
// The build holds no secrets: dist is zipped and served publicly. The capture secret is
// entered on the extension's options page instead.
import * as esbuild from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const outdir = `${dir}dist`;
const watch = process.argv.includes("--watch");

async function configAppUrl() {
  const result = await esbuild.build({ entryPoints: [`${dir}config.ts`], bundle: true, format: "esm", write: false });
  const source = result.outputFiles[0].text;
  const config = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  return config.APP_URL;
}

// Local builds read the gitignored config.ts; Vercel builds use APP_URL, else the production domain.
async function appUrl() {
  if (existsSync(`${dir}config.ts`)) return configAppUrl();
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  throw new Error("No app URL: create extension/config.ts, or set APP_URL");
}

const origin = new URL(await appUrl()).origin;

async function writeStatic() {
  const manifest = JSON.parse(await readFile(`${dir}manifest.json`, "utf8"));
  manifest.host_permissions = [`${origin}/*`];
  await mkdir(outdir, { recursive: true });
  await writeFile(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2));
  await copyFile(`${dir}options.html`, `${outdir}/options.html`);
}

const shared = { bundle: true, target: "chrome120", outdir, logLevel: "info", define: { __APP_URL__: JSON.stringify(origin) } };
const builds = [
  // Content scripts cannot be ES modules.
  { ...shared, entryPoints: { content: `${dir}content/index.ts` }, format: "iife" },
  { ...shared, entryPoints: { background: `${dir}background.ts` }, format: "esm" },
  { ...shared, entryPoints: { options: `${dir}options.ts` }, format: "iife" },
];

await writeStatic();
if (watch) {
  for (const options of builds) await (await esbuild.context(options)).watch();
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
