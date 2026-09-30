import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

const dist = path.resolve("extension/dist");
const out = path.resolve("public/flaneur-extension.zip");

if (!fs.existsSync(dist)) {
  console.error("extension/dist not found — run npm run ext:build first");
  process.exit(1);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.rmSync(out, { force: true });

const zip = new AdmZip();
zip.addLocalFolder(dist);
zip.writeZip(out);
console.log(`packed ${path.relative(process.cwd(), out)}`);
