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
// Step 3.4: the review queue is optional (a run may legitimately produce
// zero review candidates), so it is published when present but never
// required -- unlike grants.json/catalogue-meta.json above, a missing file
// here must not fail the whole publish step.
const reviewQueueSource = path.join(sourceDir, "grant-review-queue.json");
if (fs.existsSync(reviewQueueSource)) {
  for (const targetDir of [publicDir, siteDir]) {
    fs.copyFileSync(reviewQueueSource, path.join(targetDir, "grant-review-queue.json"));
  }
} else {
  console.warn("grant-review-queue.json not found in data/ -- skipping publish for this run.");
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
