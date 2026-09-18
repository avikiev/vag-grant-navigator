import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

// publish-feed.mjs resolves all paths relative to its own file location
// (path.resolve(__dirname, "..")), so to test it in isolation we copy it
// into a scratch "repo" with the expected data/ layout and run it there.
function makeScratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-feed-test-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "data"), { recursive: true });
  fs.copyFileSync(
    path.join(process.cwd(), "scripts", "publish-feed.mjs"),
    path.join(dir, "scripts", "publish-feed.mjs")
  );
  return dir;
}

test("review queue is published to both public/ and _site/ when present", () => {
  const dir = makeScratchRepo();
  fs.writeFileSync(path.join(dir, "data", "grants.json"), "[]");
  fs.writeFileSync(path.join(dir, "data", "catalogue-meta.json"), JSON.stringify({ updatedAt: "2026-09-18T15:27:41.690Z" }));
  fs.writeFileSync(path.join(dir, "data", "grant-review-queue.json"), JSON.stringify([{ identifier: "X", triage: "VERIFY" }]));

  execFileSync(process.execPath, ["scripts/publish-feed.mjs"], { cwd: dir, stdio: "pipe" });

  for (const target of ["public", "_site"]) {
    const published = path.join(dir, target, "grant-review-queue.json");
    assert.ok(fs.existsSync(published), `${target}/grant-review-queue.json should exist`);
    const content = JSON.parse(fs.readFileSync(published, "utf8"));
    assert.equal(content[0].triage, "VERIFY");
  }
});

test("publish does not fail when grant-review-queue.json is absent", () => {
  const dir = makeScratchRepo();
  fs.writeFileSync(path.join(dir, "data", "grants.json"), "[]");
  fs.writeFileSync(path.join(dir, "data", "catalogue-meta.json"), JSON.stringify({ updatedAt: "2026-09-18T15:27:41.690Z" }));
  // grant-review-queue.json intentionally NOT written.

  const result = spawnSync(process.execPath, ["scripts/publish-feed.mjs"], { cwd: dir, encoding: "utf8" });
  const combined = (result.stdout ?? "") + (result.stderr ?? "");

  assert.ok(!fs.existsSync(path.join(dir, "public", "grant-review-queue.json")));
  assert.ok(!fs.existsSync(path.join(dir, "_site", "grant-review-queue.json")));
  assert.ok(fs.existsSync(path.join(dir, "public", "grants.json")), "grants.json must still publish");
  assert.match(combined, /grant-review-queue\.json not found/);
});
