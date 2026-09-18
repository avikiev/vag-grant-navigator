import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

execFileSync(process.execPath, ["scripts/triage-review.mjs"], {
  cwd: process.cwd(),
  stdio: "pipe",
});

const queue = JSON.parse(
  fs.readFileSync("data/grant-review-queue.json", "utf8")
);

const byId = new Map(queue.map((item) => [item.identifier, item]));

test("triage queue contains all 19 review records", () => {
  assert.equal(queue.length, 19);
});

test("triage distribution is conservative: 7 partner, 10 verify, 2 reject", () => {
  const counts = queue.reduce((acc, item) => {
    acc[item.triage] = (acc[item.triage] ?? 0) + 1;
    return acc;
  }, {});

  assert.deepEqual(counts, {
    "PARTNER-CANDIDATE": 7,
    VERIFY: 10,
    REJECT: 2,
  });
});

test("NGO signal alone does not create a partner candidate", () => {
  const item = byId.get("HORIZON-NEB-2027-01-PARTICIPATION-03");

  assert.ok(item);
  assert.deepEqual(item.eligibilitySignals, ["ngo"]);
  assert.equal(item.triage, "VERIFY");
});

test("clearly off-topic records are rejected", () => {
  assert.equal(
    byId.get("HORIZON-NEB-2027-01-BUSINESS-01")?.triage,
    "REJECT"
  );
  assert.equal(
    byId.get("HORIZON-CL6-2027-01-BIODIV-04")?.triage,
    "REJECT"
  );
});

test("strong cultural tourism topic is a high-priority partner candidate", () => {
  const item = byId.get("HORIZON-CL2-2027-01-HERITAGE-06");

  assert.ok(item);
  assert.equal(item.triage, "PARTNER-CANDIDATE");
  assert.equal(item.priority, "HIGH");
});

test("budget extraction uses the exact current topic", () => {
  const item = byId.get("HORIZON-CL2-2027-01-HERITAGE-04");

  assert.ok(item);
  assert.deepEqual(item.topicBudget, {
    action:
      "HORIZON-CL2-2027-01-HERITAGE-04 - HORIZON-RIA HORIZON  Research and Innovation Actions",
    expectedGrants: 4,
    minContribution: 3000000,
    maxContribution: 4000000,
    totalTopicBudget: 16000000,
    plannedOpeningDate: "2027-05-13",
    deadlineModel: "single-stage",
    deadlineDates: ["2027-09-23"],
  });
});

test("type-8 competitive call does not receive an unrelated budget", () => {
  const item = byId.get("CREA-CULT-2025-COOP-UA-2");

  assert.ok(item);
  assert.equal(item.topicBudget, null);
});
