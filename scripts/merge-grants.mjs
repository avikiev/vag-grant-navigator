import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cataloguePath = path.join(root, "data", "grants.json");
const inboxPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "data", "grant-inbox.json");
const metaPath = path.join(root, "data", "catalogue-meta.json");
const auditPath = path.join(root, "data", "grant-import-audit.json");

const HUMAN_FIELDS = ["score", "decision", "idea", "owner", "internalDeadline", "nextAction", "risk", "fit"];
const AUTO_FIELDS = ["title", "organisation", "deadline", "deadlineLabel", "topics", "amount", "applicant", "summary", "url"];
const VALID_TOPICS = new Set(["Туризм", "Культура", "Освіта"]);

function loadJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}
function gate(candidate) {
  const reasons = [];
  const v = candidate.verification || {};
  if (!candidate.id || !/^[a-z0-9][a-z0-9-]*$/.test(candidate.id)) reasons.push("invalid id");
  for (const field of ["title", "organisation", "deadlineLabel", "amount", "applicant", "summary", "url"]) {
    if (!candidate[field]) reasons.push(`missing ${field}`);
  }
  if (!Array.isArray(candidate.topics) || candidate.topics.length === 0 || candidate.topics.some((x) => !VALID_TOPICS.has(x))) reasons.push("invalid topics");
  if (!candidate.url?.startsWith("https://")) reasons.push("official URL must use https");
  if (v.officialSource !== true) reasons.push("official source not verified");
  if (v.eligibilityVerified !== true) reasons.push("eligibility not verified");
  if (v.deadlineVerified !== true) reasons.push("deadline not verified");
  if (!v.verifiedAt) reasons.push("missing verifiedAt");
  if (!Array.isArray(v.evidenceUrls) || v.evidenceUrls.length === 0) reasons.push("missing evidenceUrls");
  return reasons;
}

const catalogue = loadJson(cataloguePath, []);
const inbox = loadJson(inboxPath, []);
if (!Array.isArray(catalogue) || !Array.isArray(inbox)) throw new Error("Catalogue and inbox must be JSON arrays");

const byId = new Map(catalogue.map((g) => [g.id, g]));
const audit = { runAt: new Date().toISOString(), accepted: [], rejected: [] };

for (const candidate of inbox) {
  const reasons = gate(candidate);
  if (reasons.length) {
    audit.rejected.push({ id: candidate.id ?? null, title: candidate.title ?? null, reasons });
    continue;
  }

  const existing = byId.get(candidate.id);
  if (existing) {
    const updated = { ...existing };
    for (const field of AUTO_FIELDS) updated[field] = candidate[field];
    // Human decision fields are deliberately preserved.
    for (const field of HUMAN_FIELDS) updated[field] = existing[field];
    updated.sourceVerification = candidate.verification;
    byId.set(candidate.id, updated);
    audit.accepted.push({ id: candidate.id, action: "updated" });
  } else {
    byId.set(candidate.id, {
      id: candidate.id,
      ...Object.fromEntries(AUTO_FIELDS.map((f) => [f, candidate[f]])),
      score: 0,
      decision: "MONITOR",
      idea: "Потребує стратегічної оцінки ВАГ",
      owner: "—",
      internalDeadline: "—",
      nextAction: "Оцінити стратегічну відповідність і прийняти рішення GO / PARTNER / PREPARE / MONITOR / NO-GO",
      risk: "Нова можливість пройшла Evidence Gate, але управлінське рішення ВАГ ще не прийнято",
      fit: [0, 0, 0, 0, 0],
      sourceVerification: candidate.verification
    });
    audit.accepted.push({ id: candidate.id, action: "added" });
  }
}

const nextCatalogue = [...byId.values()].sort((a, b) => {
  if (!a.deadline && !b.deadline) return (b.score ?? 0) - (a.score ?? 0);
  if (!a.deadline) return 1;
  if (!b.deadline) return -1;
  return new Date(a.deadline) - new Date(b.deadline);
});

writeJson(cataloguePath, nextCatalogue);
writeJson(metaPath, {
  updatedAt: new Date().toISOString(),
  source: "automated-evidence-gate",
  version: (loadJson(metaPath, { version: 0 }).version ?? 0) + 1,
  accepted: audit.accepted.length,
  rejected: audit.rejected.length
});
writeJson(auditPath, audit);

console.log(`Evidence Gate: ${audit.accepted.length} accepted, ${audit.rejected.length} rejected.`);
if (audit.rejected.length) console.log("See data/grant-import-audit.json for rejection reasons.");
