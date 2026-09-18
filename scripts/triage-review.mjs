import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "grant-watch-review.json");
const OUTPUT_PATH = path.join(ROOT, "data", "grant-review-queue.json");

const PARTNER_TERMS = [
  "cultural heritage",
  "cultural tourism",
  "tourism",
  "intangible cultural heritage",
  "cultural memory",
  "memory",
  "community",
  "communities",
  "participation",
  "civil society",
  "ngo",
  "inclusion",
  "inclusive",
  "accessibility",
  "skills",
  "vocational",
  "education",
  "training",
  "culture",
  "creative industries",
];

const STRONG_TERMS = [
  "cultural tourism",
  "intangible cultural heritage",
  "cultural heritage",
  "cultural memory",
  "tourism",
];

const LOW_RELEVANCE_TERMS = [
  "invasive alien species",
  "modular construction",
  "construction components",
];

function text(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(" ");
  return String(value);
}

function searchableText(record) {
  return text(record.title).toLowerCase();
}

function matchedTerms(haystack, terms) {
  return [...new Set(terms.filter((term) => haystack.includes(term)))];
}

function parseBudgetOverview(record) {
  const raw = record.metadata?.budgetOverview?.[0];
  if (!raw || !record.identifier) return null;

  try {
    const parsed = JSON.parse(raw);
    const maps = parsed?.budgetTopicActionMap ?? {};

    for (const entries of Object.values(maps)) {
      if (!Array.isArray(entries)) continue;

      for (const entry of entries) {
        const action = text(entry?.action);
        if (!action.startsWith(record.identifier)) continue;

        const yearlyBudget = Object.values(entry?.budgetYearMap ?? {})
          .map(Number)
          .filter(Number.isFinite)
          .reduce((sum, value) => sum + value, 0);

        return {
          action: entry.action ?? null,
          expectedGrants: entry.expectedGrants ?? null,
          minContribution: entry.minContribution ?? null,
          maxContribution: entry.maxContribution ?? null,
          totalTopicBudget: yearlyBudget || null,
          plannedOpeningDate: entry.plannedOpeningDate ?? null,
          deadlineModel: entry.deadlineModel ?? null,
          deadlineDates: entry.deadlineDates ?? [],
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

function triageRecord(record) {
  const haystack = searchableText(record);
  const strongMatches = matchedTerms(haystack, STRONG_TERMS);
  const partnerMatches = matchedTerms(haystack, PARTNER_TERMS);
  const lowMatches = matchedTerms(haystack, LOW_RELEVANCE_TERMS);
  const signals = record.verification?.eligibilitySignals ?? [];

  let triage = "VERIFY";
  let priority = "MEDIUM";
  let triageReason =
    "Official source and deadline are available, but UTGA eligibility is not verified.";

  if (lowMatches.length > 0 && strongMatches.length === 0) {
    triage = "REJECT";
    priority = "LOW";
    triageReason =
      `Low thematic relevance to UTGA detected: ${lowMatches.join(", ")}.`;
  } else if (strongMatches.length > 0) {
    triage = "PARTNER-CANDIDATE";
    priority = "HIGH";
    triageReason =
      `Strong UTGA thematic match: ${strongMatches.join(", ")}. ` +
      "Eligibility and consortium role still require verification.";
  } else if (partnerMatches.length > 0) {
    triage = "PARTNER-CANDIDATE";
    priority = "MEDIUM";
    triageReason =
      `Potential UTGA relevance: ${[...new Set([...partnerMatches, ...signals])].join(", ")}. ` +
      "Eligibility and consortium role still require verification.";
  }

  return {
    identifier: record.identifier ?? null,
    title: record.title ?? null,
    url: record.url ?? null,
    deadline: record.deadlines?.[0] ?? null,
    officialSource: record.verification?.officialSource === true,
    eligibilityVerified: record.verification?.eligibilityVerified === true,
    eligibilitySignals: signals,
    triage,
    priority,
    triageReason,
    matchedTerms: [...new Set([...strongMatches, ...partnerMatches])],
    topicBudget: parseBudgetOverview(record),
    source: record.verification?.source ?? null,
  };
}

if (!fs.existsSync(INPUT_PATH)) {
  throw new Error(`Review input not found: ${INPUT_PATH}`);
}

const input = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));

if (!Array.isArray(input)) {
  throw new Error("grant-watch-review.json must contain an array");
}

const queue = input.map(triageRecord);

fs.writeFileSync(
  OUTPUT_PATH,
  `${JSON.stringify(queue, null, 2)}\n`,
  "utf8"
);

const counts = queue.reduce((acc, item) => {
  acc[item.triage] = (acc[item.triage] ?? 0) + 1;
  return acc;
}, {});

console.log(`Review records: ${queue.length}`);
console.log("Triage:", counts);
console.log(`Wrote ${OUTPUT_PATH}`);
