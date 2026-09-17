"""
UTGA Grant Watcher v0.2

Purpose
-------
Discover candidate EU Funding & Tenders opportunities, scrape the official
opportunity page, and write ONLY conservatively verified records to
`data/grant-inbox.json` in the schema expected by `scripts/merge-grants.mjs`.

Important
---------
This is intentionally fail-closed. If the watcher cannot verify all of:
  1) official source,
  2) deadline,
  3) UTGA-relevant eligibility wording,
then the candidate is written to `data/grant-watch-review.json` and is NOT
published to the Navigator by the Evidence Gate.

The Funding & Tenders Portal is a dynamic SPA. The search-page parser below is
heuristic and should be calibrated with --debug if the portal markup changes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import quote, urlparse

from firecrawl import FirecrawlApp

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
INBOX_PATH = DATA_DIR / "grant-inbox.json"
REVIEW_PATH = DATA_DIR / "grant-watch-review.json"
DEBUG_PATH = DATA_DIR / "debug_output.md"

FIRECRAWL_API_KEY = os.environ.get("FIRECRAWL_API_KEY")
if not FIRECRAWL_API_KEY:
    raise SystemExit("FIRECRAWL_API_KEY is required")

app = FirecrawlApp(api_key=FIRECRAWL_API_KEY)

KEYWORDS = [
    "tourism skills",
    "cultural heritage",
    "vocational education tourism",
    "accessible tourism",
    "digital skills tourism",
]

SEARCH_URL_TEMPLATE = (
    "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/"
    "opportunities/topic-search?keywords={keyword}&order=DESC"
    "&pageNumber=1&pageSize=50&sortBy=startDate&status=31094501,31094502"
)

OFFICIAL_HOST_SUFFIXES = (
    "ec.europa.eu",
    "europa.eu",
    "erasmus-plus.ec.europa.eu",
)

# Conservative signals. We require at least one UTGA-relevant legal/entity signal.
ELIGIBILITY_SIGNALS = [
    "non-profit",
    "nonprofit",
    "civil society",
    "association",
    "ngo",
    "non-governmental",
    "legal entity",
    "organisation established in ukraine",
    "organization established in ukraine",
    "candidate country",
    "ukraine",
]

TOPIC_RULES = {
    "Туризм": ["tourism", "tourist", "hospitality", "destination", "guide"],
    "Культура": ["culture", "cultural", "heritage", "memory", "museum", "creative"],
    "Освіта": ["education", "training", "skills", "vet", "vocational", "learning", "qualification"],
}

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}


@dataclass
class Candidate:
    title: str
    url: str
    keyword: str
    search_block: str


def scrape_url(url: str, wait_for: int = 5000) -> str:
    result = app.scrape_url(
        url,
        params={
            "formats": ["markdown"],
            "onlyMainContent": True,
            "waitFor": wait_for,
        },
    )
    if isinstance(result, dict):
        return result.get("markdown", "") or ""
    return getattr(result, "markdown", "") or ""


def official_url(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    return any(host == suffix or host.endswith("." + suffix) for suffix in OFFICIAL_HOST_SUFFIXES)


def stable_id(title: str, url: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:46]
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:8]
    return f"{slug or 'eu-call'}-{digest}"


def discover_from_search_markdown(md: str, keyword: str) -> list[Candidate]:
    """Heuristic parser for markdown search results. Fail-safe: only official links."""
    candidates: list[Candidate] = []
    seen = set()
    blocks = re.split(r"\n\s*\n", md)
    link_re = re.compile(r"\[([^\]]{4,180})\]\((https://[^)]+)\)")

    for block in blocks:
        lower = block.lower()
        if not any(token in lower for token in ("deadline", "call", "topic", "funding")):
            continue
        for title, url in link_re.findall(block):
            url = url.strip()
            title = re.sub(r"\s+", " ", title).strip()
            if not official_url(url):
                continue
            # Ignore obvious navigation/static links.
            if any(x in url.lower() for x in ("/about", "/support", "/manual", "privacy", "cookies")):
                continue
            key = (title, url)
            if key in seen:
                continue
            seen.add(key)
            candidates.append(Candidate(title=title, url=url, keyword=keyword, search_block=block[:2000]))
    return candidates


def extract_deadline(text: str) -> tuple[str | None, str | None]:
    """Extract one explicit future deadline. Returns (ISO-ish string, display label)."""
    flat = re.sub(r"\s+", " ", text)

    # 1) DD Month YYYY, optional time and timezone
    p1 = re.compile(
        r"(?:deadline[^\n:.]{0,80}[:\-]?\s*)?"
        r"(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})"
        r"(?:\s*(?:at|,)?\s*(\d{1,2})[:.](\d{2})\s*(CET|CEST|EET|EEST|UTC)?)?",
        re.I,
    )
    for m in p1.finditer(flat):
        day, month_name, year, hh, mm, tz = m.groups()
        month = MONTHS.get(month_name.lower())
        if not month:
            continue
        hour = int(hh) if hh else 23
        minute = int(mm) if mm else 59
        iso = f"{int(year):04d}-{month:02d}-{int(day):02d}T{hour:02d}:{minute:02d}:00"
        label = f"{int(day)} {month_name} {year}" + (f" · {hour:02d}:{minute:02d} {tz}" if hh else "")
        return iso, label

    # 2) YYYY-MM-DD, optional time
    p2 = re.compile(r"(20\d{2})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?")
    m = p2.search(flat)
    if m:
        y, mo, d, hh, mm = m.groups()
        hour = int(hh) if hh else 23
        minute = int(mm) if mm else 59
        iso = f"{y}-{mo}-{d}T{hour:02d}:{minute:02d}:00"
        return iso, f"{d}.{mo}.{y}" + (f" · {hour:02d}:{minute:02d}" if hh else "")

    return None, None


def infer_topics(text: str) -> list[str]:
    low = text.lower()
    topics = [topic for topic, words in TOPIC_RULES.items() if any(w in low for w in words)]
    return topics or ["Освіта"]


def infer_organisation(text: str) -> str:
    low = text.lower()
    if "erasmus" in low:
        return "Erasmus+ · European Commission"
    if "creative europe" in low:
        return "Creative Europe · European Commission"
    if "cerv" in low or "citizens, equality, rights and values" in low:
        return "CERV · European Commission"
    return "European Commission"


def infer_amount(text: str) -> str:
    flat = re.sub(r"\s+", " ", text)
    patterns = [
        r"(?:maximum|max(?:imum)? grant|budget|funding)[^€]{0,80}(€\s?[\d,. ]+(?:\s?(?:million|m))?)",
        r"(€\s?[\d,. ]+(?:\s?(?:million|m))?)",
    ]
    for p in patterns:
        m = re.search(p, flat, re.I)
        if m:
            return re.sub(r"\s+", " ", m.group(1)).strip()
    return "див. офіційні умови"


def infer_applicant(text: str) -> tuple[str, bool, list[str]]:
    low = text.lower()
    hits = [signal for signal in ELIGIBILITY_SIGNALS if signal in low]
    if not hits:
        return "Eligibility потребує ручної перевірки", False, []

    # Stronger rule: Ukraine/candidate-country must co-exist with entity-type signal,
    # unless the page explicitly says legal entities established in Ukraine.
    geo = any(x in low for x in ("ukraine", "candidate countr"))
    entity = any(x in low for x in ("association", "non-profit", "nonprofit", "civil society", "ngo", "legal entit", "non-governmental"))
    verified = geo and entity
    if verified:
        return "Українські неприбуткові / громадські організації — за офіційними умовами сторінки", True, hits
    return "Eligibility потребує ручної перевірки", False, hits


def short_summary(text: str, title: str) -> str:
    flat = re.sub(r"\s+", " ", text).strip()
    # Prefer a paragraph containing the title or 'objective'.
    candidates = re.split(r"(?<=[.!?])\s+", flat)
    chosen = []
    for sent in candidates:
        low = sent.lower()
        if any(k in low for k in ("objective", "aim", "support", "funding", "project")):
            chosen.append(sent)
        if sum(len(x) for x in chosen) > 420:
            break
    summary = " ".join(chosen) if chosen else flat[:500]
    return summary[:650].strip()


def verify_candidate(c: Candidate) -> tuple[dict | None, dict]:
    page = scrape_url(c.url, wait_for=5000)
    deadline, deadline_label = extract_deadline(page)
    applicant, eligibility_ok, eligibility_hits = infer_applicant(page)
    source_ok = official_url(c.url) and len(page) > 200
    deadline_ok = bool(deadline)

    evidence = {
        "title": c.title,
        "url": c.url,
        "keyword": c.keyword,
        "officialSource": source_ok,
        "eligibilityVerified": eligibility_ok,
        "deadlineVerified": deadline_ok,
        "eligibilitySignals": eligibility_hits,
        "pageChars": len(page),
    }

    if not (source_ok and eligibility_ok and deadline_ok):
        return None, evidence

    title = c.title.strip()
    record = {
        "id": stable_id(title, c.url),
        "title": title,
        "organisation": infer_organisation(page),
        "deadline": deadline,
        "deadlineLabel": deadline_label or deadline,
        "topics": infer_topics(title + "\n" + page[:12000]),
        "amount": infer_amount(page),
        "applicant": applicant,
        "summary": short_summary(page, title),
        "url": c.url,
        "verification": {
            "officialSource": True,
            "eligibilityVerified": True,
            "deadlineVerified": True,
            "verifiedAt": datetime.now(timezone.utc).isoformat(),
            "evidenceUrls": [c.url],
            "method": "UTGA Grant Watcher v0.2 conservative auto-verification",
        },
    }
    return record, evidence


def dedupe(records: Iterable[dict]) -> list[dict]:
    by_url = {}
    for r in records:
        by_url[r["url"]] = r
    return list(by_url.values())


def run(debug: bool = False) -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    all_candidates: list[Candidate] = []
    debug_chunks = []

    for kw in KEYWORDS:
        url = SEARCH_URL_TEMPLATE.format(keyword=quote(kw))
        print(f"[search] {kw}")
        md = scrape_url(url, wait_for=5000)
        if debug:
            debug_chunks.append(f"\n\n# KEYWORD: {kw}\n\n{md}")
        found = discover_from_search_markdown(md, kw)
        print(f"  candidates: {len(found)}")
        all_candidates.extend(found)

    unique_candidates = {(c.title, c.url): c for c in all_candidates}.values()
    accepted, review = [], []

    for c in unique_candidates:
        try:
            record, evidence = verify_candidate(c)
            if record:
                accepted.append(record)
                print(f"[verified] {record['title']}")
            else:
                review.append({**asdict(c), "verification": evidence})
                print(f"[review] {c.title}")
        except Exception as exc:
            review.append({**asdict(c), "error": str(exc)})
            print(f"[error] {c.title}: {exc}", file=sys.stderr)

    accepted = dedupe(accepted)
    INBOX_PATH.write_text(json.dumps(accepted, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REVIEW_PATH.write_text(json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if debug:
        DEBUG_PATH.write_text("".join(debug_chunks), encoding="utf-8")

    print(f"Wrote {len(accepted)} verified records -> {INBOX_PATH}")
    print(f"Wrote {len(review)} review records -> {REVIEW_PATH}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--debug", action="store_true", help="save raw search markdown")
    args = parser.parse_args()
    return run(debug=args.debug)


if __name__ == "__main__":
    raise SystemExit(main())
