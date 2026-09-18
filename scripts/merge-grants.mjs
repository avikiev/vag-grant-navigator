import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function resolvePaths() {
  return {
    cataloguePath: process.env.GRANTS_CATALOGUE_PATH
      ? path.resolve(process.env.GRANTS_CATALOGUE_PATH)
      : path.join(root, "data", "grants.json"),
    inboxPath: process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "data", "grant-inbox.json"),
    metaPath: process.env.GRANTS_META_PATH
      ? path.resolve(process.env.GRANTS_META_PATH)
      : path.join(root, "data", "catalogue-meta.json"),
    auditPath: process.env.GRANTS_AUDIT_PATH
      ? path.resolve(process.env.GRANTS_AUDIT_PATH)
      : path.join(root, "data", "grant-import-audit.json"),
  };
}

const HUMAN_FIELDS = ["score", "decision", "idea", "owner", "internalDeadline", "nextAction", "risk", "fit"];
const AUTO_FIELDS = ["title", "organisation", "deadline", "deadlineLabel", "topics", "amount", "applicant", "summary", "url"];
const VALID_TOPICS = new Set(["Туризм", "Культура", "Освіта"]);

// --- Identity resolution for SEDIA competitive calls ------------------------
//
// eu_grants_watch.py generates a deterministic `id` from title+url for every
// discovered candidate. For SEDIA type=8 competitive calls this generated id
// does NOT match the historical/curated catalogue id, because several
// distinct competitive calls can share one generic `identifier`
// (e.g. CREA-CULT-2025-COOP-UA-2), so identifier alone is not a safe key
// either. The only reliable per-call key is callccm2Id.
//
// This map is the ONLY place canonical aliases are declared. Add new
// entries here when a newly discovered SEDIA competitive call should be
// merged into an existing hand-curated catalogue record instead of creating
// a new one.
const SEDIA_CALL_ALIASES = new Map([
  ["15381", "memory-action"],
  ["15523", "collaboration-grants"],
  // 15241 intentionally NOT aliased -- remains its own new catalogue record.
]);

function candidateCallccm2Id(candidate) {
  return String(
    candidate.sediaCallccm2Id ||
      candidate.verification?.callccm2Id ||
      candidate.sourceVerification?.callccm2Id ||
      ""
  ).trim();
}

// Exported so it can be unit-tested directly without spawning the whole script.
export function canonicalId(candidate) {
  const callId = candidateCallccm2Id(candidate);
  if (callId && SEDIA_CALL_ALIASES.has(callId)) {
    return SEDIA_CALL_ALIASES.get(callId);
  }
  return candidate.id;
}

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

// Paths are resolved FRESH on every call (not once at module import time),
// so tests can point GRANTS_CATALOGUE_PATH/etc. at scratch files and get
// correct isolation between runs within the same process.
export function runMerge() {
  const { cataloguePath, inboxPath, metaPath, auditPath } = resolvePaths();

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

    const resolvedId = canonicalId(candidate);
    const existing = byId.get(resolvedId);

    if (existing) {
      const updated = { ...existing };
      for (const field of AUTO_FIELDS) updated[field] = candidate[field];
      // Human decision fields are deliberately preserved.
      for (const field of HUMAN_FIELDS) updated[field] = existing[field];
      updated.sourceVerification = candidate.verification;
      byId.set(resolvedId, updated);
      const entry = { id: resolvedId, action: "updated" };
      if (resolvedId !== candidate.id) entry.generatedId = candidate.id;
      audit.accepted.push(entry);
    } else {
      byId.set(resolvedId, {
        id: resolvedId,
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
      const entry = { id: resolvedId, action: "added" };
      if (resolvedId !== candidate.id) entry.generatedId = candidate.id;
      audit.accepted.push(entry);
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
  return { catalogue: nextCatalogue, audit };
}

// Explicit opt-out flag instead of a fragile import.meta.url/process.argv[1]
// comparison (that comparison proved unreliable under `node --test` and is
// also broken on Windows paths, which is this project's actual environment --
// `file://${process.argv[1]}` is not a valid file URL for a `C:\...` path).
if (!process.env.MERGE_GRANTS_TEST_MODE) {
  runMerge();
}
