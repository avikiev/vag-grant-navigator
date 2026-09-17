import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "data");
const publicDir = path.join(root, "public");
const siteDir = path.join(root, "_site");

for (const dir of [publicDir, siteDir]) fs.mkdirSync(dir, { recursive: true });
for (const name of ["grants.json", "catalogue-meta.json"]) {
  const source = path.join(sourceDir, name);
  if (!fs.existsSync(source)) throw new Error(`Missing ${source}`);
  for (const targetDir of [publicDir, siteDir]) fs.copyFileSync(source, path.join(targetDir, name));
}

const meta = JSON.parse(fs.readFileSync(path.join(sourceDir, "catalogue-meta.json"), "utf8"));
fs.writeFileSync(path.join(siteDir, "health.json"), JSON.stringify({
  ok: true,
  service: "UTGA Grant Navigator Feed",
  catalogueUpdatedAt: meta.updatedAt ?? null,
  generatedAt: new Date().toISOString(),
  schemaVersion: 1,
}, null, 2) + "\n");

console.log("Published public/grants.json and _site feed payload.");
