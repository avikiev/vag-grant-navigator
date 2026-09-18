"""
UTGA Grant Watcher v0.3

Purpose
-------
Discover relevant EU Funding & Tenders opportunities through the official
European Commission SEDIA Search API and write ONLY conservatively verified
records to `data/grant-inbox.json` in the schema expected by
`scripts/merge-grants.mjs`.

Important
---------
This watcher is intentionally fail-closed.

Discovery requires:
  1) SEDIA official data source,
  2) Forthcoming/Open status,
  3) explicit future deadline,
  4) relevance to UTGA search themes.

Publication additionally requires UTGA-relevant eligibility wording.
Candidates whose eligibility cannot be verified are written to
`data/grant-watch-review.json` and are NOT published by the Evidence Gate.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.request
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
INBOX_PATH = DATA_DIR / "grant-inbox.json"
REVIEW_PATH = DATA_DIR / "grant-watch-review.json"

SEARCH_API_URL_TEMPLATE = (
    "https://api.tech.ec.europa.eu/search-api/prod/rest/search"
    "?apiKey=SEDIA&text=***&pageSize=50&pageNumber={page_number}"
)

TOPIC_URL_TEMPLATE = (
    "https://ec.europa.eu/info/funding-tenders/opportunities/portal/"
    "screen/opportunities/topic-details/{identifier}"
)

# Verified SEDIA status codes used by the Funding & Tenders Portal.
STATUS_FORTHCOMING = "31094501"
STATUS_OPEN = "31094502"
DISCOVERY_STATUSES = [STATUS_FORTHCOMING, STATUS_OPEN]

KEYWORDS = [
    "tourism skills",
    "cultural heritage",
    "vocational education tourism",
    "accessible tourism",
    "digital skills tourism",
]

OFFICIAL_HOST_SUFFIXES = (
    "ec.europa.eu",
    "europa.eu",
    "erasmus-plus.ec.europa.eu",
)

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
    "Культура": [
        "culture",
        "cultural",
        "heritage",
        "memory",
        "museum",
        "creative",
    ],
    "Освіта": [
        "education",
        "training",
        "skills",
        "vet",
        "vocational",
        "learning",
        "qualification",
    ],
}


@dataclass
class Candidate:
    title: str
    url: str
    keyword: str
    identifier: str
    status: str
    deadlines: list[str]
    metadata: dict


def first_value(value, default=""):
    if isinstance(value, list):
        return value[0] if value else default
    return value if value is not None else default


def official_url(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    return any(
        host == suffix or host.endswith("." + suffix)
        for suffix in OFFICIAL_HOST_SUFFIXES
    )


def stable_id(title: str, url: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:46]
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:8]
    return f"{slug or 'eu-call'}-{digest}"


def multipart_json(fields: dict) -> tuple[bytes, str]:
    boundary = "----UTGAGrantNavigator" + uuid.uuid4().hex
    body = bytearray()

    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(
            (
                f'Content-Disposition: form-data; name="{name}"; '
                f'filename="blob"\r\n'
            ).encode()
        )
        body.extend(b"Content-Type: application/json\r\n\r\n")
        body.extend(json.dumps(value).encode("utf-8"))
        body.extend(b"\r\n")

    body.extend(f"--{boundary}--\r\n".encode())
    return bytes(body), boundary


def search_query(keyword: str) -> dict:
    return {
        "bool": {
            "must": [
                {
                    "bool": {
                        "must": [
                            {"terms": {"type": ["1", "2", "8"]}},
                            {"terms": {"status": DISCOVERY_STATUSES}},
                            {"terms": {"DATASOURCE": ["SEDIA"]}},
                            {"terms": {"language": ["en"]}},
                        ]
                    }
                },
                {
                    "bool": {
                        "should": [
                            {
                                "phrase": {
                                    "query": keyword,
                                    "field": "identifier",
                                    "phraseSlop": 0,
                                    "boost": 1100,
                                }
                            },
                            {
                                "phrase": {
                                    "query": keyword,
                                    "field": "keywords",
                                    "phraseSlop": 0,
                                    "boost": 1000,
                                }
                            },
                            {
                                "phrase": {
                                    "query": keyword,
                                    "field": "tags",
                                    "phraseSlop": 0,
                                    "boost": 950,
                                }
                            },
                            {
                                "phrase": {
                                    "query": keyword,
                                    "field": "typesOfAction",
                                    "phraseSlop": 1,
                                    "boost": 900,
                                }
                            },
                            {
                                "phrase": {
                                    "query": keyword,
                                    "field": "title",
                                    "phraseSlop": 1,
                                    "boost": 200,
                                }
                            },
                            {
                                "phrase": {
                                    "query": keyword,
                                    "field": "callTitle",
                                    "phraseSlop": 1,
                                    "boost": 150,
                                }
                            },
                            {
                                "phrase": {
                                    "query": keyword,
                                    "field": "description",
                                    "phraseSlop": 2,
                                    "boost": 100,
                                }
                            },
                        ]
                    }
                },
            ]
        }
    }


def search_sedia(keyword: str) -> list[dict]:
    fields = {
        "sort": {"order": "DESC", "field": "relevance"},
        "query": search_query(keyword),
        "languages": ["en"],
        "displayFields": [
            "caName",
            "callccm2Id",
            "deadlineDate",
            "deadlineModel",
            "frameworkProgramme",
            "identifier",
            "startDate",
            "status",
            "title",
            "type",
            "typesOfAction",
            "description",
            "keywords",
            "tags",
            "topicConditions",
            "budgetOverview",
        ],
    }

    all_results = []
    page_number = 1

    while True:
        body, boundary = multipart_json(fields)

        url = SEARCH_API_URL_TEMPLATE.format(
            page_number=page_number
        )

        request = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "Accept": "application/json",
                "Content-Type": (
                    f"multipart/form-data; boundary={boundary}"
                ),
                "Origin": "https://ec.europa.eu",
                "X-Requested-With": "XMLHttpRequest",
                "User-Agent": "UTGA-Grant-Navigator/0.3",
            },
        )

        with urllib.request.urlopen(
            request,
            timeout=45,
        ) as response:
            result = json.loads(
                response.read().decode("utf-8")
            )

        page_results = result.get("results", [])
        if not isinstance(page_results, list):
            page_results = []

        all_results.extend(page_results)

        total_results = result.get("totalResults", 0)
        page_size = result.get("pageSize", 50)

        try:
            total_results = int(total_results)
            page_size = int(page_size)
        except (TypeError, ValueError):
            break

        if page_size <= 0:
            break

        if len(all_results) >= total_results:
            break

        if not page_results:
            break

        page_number += 1

    return all_results


def future_deadlines(values) -> list[str]:
    if not isinstance(values, list):
        values = [values] if values else []

    now = datetime.now(timezone.utc)
    future = []

    for value in values:
        if not value:
            continue
        try:
            dt = datetime.strptime(
                value,
                "%Y-%m-%dT%H:%M:%S.%f%z",
            )
        except ValueError:
            try:
                dt = datetime.fromisoformat(
                    value.replace("Z", "+00:00")
                )
            except ValueError:
                continue

        if dt > now:
            future.append(value)

    return sorted(set(future))


def candidate_from_result(item: dict, keyword: str) -> Candidate | None:
    metadata = item.get("metadata") or {}

    identifier = str(first_value(metadata.get("identifier"))).strip()
    title = str(first_value(metadata.get("title"))).strip()
    status = str(first_value(metadata.get("status"))).strip()
    datasource = str(first_value(metadata.get("DATASOURCE"))).strip()

    if not identifier or not title:
        return None

    if datasource != "SEDIA":
        return None

    if status not in DISCOVERY_STATUSES:
        return None

    deadlines = future_deadlines(metadata.get("deadlineDate"))
    if not deadlines:
        return None

    url = TOPIC_URL_TEMPLATE.format(identifier=identifier)

    if not official_url(url):
        return None

    return Candidate(
        title=title,
        url=url,
        keyword=keyword,
        identifier=identifier,
        status=status,
        deadlines=deadlines,
        metadata=metadata,
    )


def metadata_text(metadata: dict) -> str:
    values = []

    for key in (
        "title",
        "description",
        "keywords",
        "tags",
        "typesOfAction",
        "topicConditions",
        "frameworkProgramme",
        "caName",
        "budgetOverview",
    ):
        value = metadata.get(key)
        if value is None:
            continue
        if isinstance(value, (dict, list)):
            values.append(
                json.dumps(value, ensure_ascii=False)
            )
        else:
            values.append(str(value))

    return "\n".join(values)


def infer_topics(text: str) -> list[str]:
    low = text.lower()
    topics = [
        topic
        for topic, words in TOPIC_RULES.items()
        if any(word in low for word in words)
    ]
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


def infer_amount(metadata: dict, identifier: str) -> str:
    """
    Extract funding only for the current SEDIA topic.

    budgetOverview is returned by the Search API as list[str], where each
    string contains JSON for the whole call. We must never infer the amount
    from another topic in that call.
    """
    raw_values = metadata.get("budgetOverview")

    if not isinstance(raw_values, list):
        raw_values = [raw_values] if raw_values else []

    for raw in raw_values:
        if not isinstance(raw, str):
            continue

        try:
            overview = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue

        action_map = overview.get("budgetTopicActionMap")
        if not isinstance(action_map, dict):
            continue

        for entries in action_map.values():
            if not isinstance(entries, list):
                continue

            for entry in entries:
                if not isinstance(entry, dict):
                    continue

                action = str(entry.get("action") or "")
                if not (
                    action == identifier
                    or action.startswith(identifier + " ")
                    or action.startswith(identifier + " -")
                ):
                    continue

                minimum = entry.get("minContribution")
                maximum = entry.get("maxContribution")

                if isinstance(minimum, (int, float)) and isinstance(
                    maximum, (int, float)
                ):
                    if minimum == maximum:
                        return f"€{minimum:,.0f}".replace(",", " ")

                    return (
                        f"€{minimum:,.0f}–€{maximum:,.0f}"
                    ).replace(",", " ")

                if isinstance(maximum, (int, float)):
                    return f"до €{maximum:,.0f}".replace(",", " ")

                if isinstance(minimum, (int, float)):
                    return f"від €{minimum:,.0f}".replace(",", " ")

                budget_year_map = entry.get("budgetYearMap")
                if isinstance(budget_year_map, dict):
                    values = []

                    for value in budget_year_map.values():
                        try:
                            values.append(float(value))
                        except (TypeError, ValueError):
                            pass

                    if values:
                        total = sum(values)
                        return (
                            f"бюджет topic €{total:,.0f}"
                        ).replace(",", " ")

                return "див. офіційні умови"

    return "див. офіційні умови"


def infer_applicant(text: str) -> tuple[str, bool, list[str]]:
    low = text.lower()

    hits = [
        signal
        for signal in ELIGIBILITY_SIGNALS
        if signal in low
    ]

    if not hits:
        return (
            "Eligibility потребує ручної перевірки",
            False,
            [],
        )

    geo = any(
        value in low
        for value in ("ukraine", "candidate countr")
    )

    entity = any(
        value in low
        for value in (
            "association",
            "non-profit",
            "nonprofit",
            "civil society",
            "ngo",
            "legal entit",
            "non-governmental",
        )
    )

    verified = geo and entity

    if verified:
        return (
            "Українські неприбуткові / громадські організації — "
            "за офіційними умовами сторінки",
            True,
            hits,
        )

    return (
        "Eligibility потребує ручної перевірки",
        False,
        hits,
    )


def short_summary(text: str, title: str) -> str:
    flat = re.sub(r"\s+", " ", text).strip()

    candidates = re.split(r"(?<=[.!?])\s+", flat)
    chosen = []

    for sentence in candidates:
        low = sentence.lower()
        if any(
            key in low
            for key in (
                "objective",
                "aim",
                "support",
                "funding",
                "project",
            )
        ):
            chosen.append(sentence)

        if sum(len(value) for value in chosen) > 420:
            break

    summary = " ".join(chosen) if chosen else flat[:500]
    return summary[:650].strip()


def deadline_label(value: str) -> str:
    try:
        dt = datetime.strptime(
            value,
            "%Y-%m-%dT%H:%M:%S.%f%z",
        )
        return dt.strftime("%d.%m.%Y · %H:%M UTC")
    except ValueError:
        return value


def verify_candidate(c: Candidate) -> tuple[dict | None, dict]:
    text = metadata_text(c.metadata)

    applicant, eligibility_ok, eligibility_hits = infer_applicant(text)

    source_ok = official_url(c.url)
    deadline_ok = bool(c.deadlines)

    evidence = {
        "title": c.title,
        "url": c.url,
        "identifier": c.identifier,
        "keyword": c.keyword,
        "status": c.status,
        "officialSource": source_ok,
        "eligibilityVerified": eligibility_ok,
        "deadlineVerified": deadline_ok,
        "eligibilitySignals": eligibility_hits,
        "deadlines": c.deadlines,
        "source": "European Commission SEDIA Search API",
    }

    if not (source_ok and eligibility_ok and deadline_ok):
        return None, evidence

    # For multi-deadline topics we deliberately use the earliest future
    # deadline. The complete list remains in verification evidence.
    deadline = c.deadlines[0]

    record = {
        "id": stable_id(c.title, c.url),
        "title": c.title,
        "organisation": infer_organisation(text),
        "deadline": deadline,
        "deadlineLabel": deadline_label(deadline),
        "topics": infer_topics(c.title + "\n" + text),
        "amount": infer_amount(c.metadata, c.identifier),
        "applicant": applicant,
        "summary": short_summary(text, c.title),
        "url": c.url,
        "verification": {
            "officialSource": True,
            "eligibilityVerified": True,
            "deadlineVerified": True,
            "verifiedAt": datetime.now(timezone.utc).isoformat(),
            "evidenceUrls": [c.url],
            "method": (
                "UTGA Grant Watcher v0.3 conservative "
                "SEDIA structured verification"
            ),
        },
    }

    return record, evidence


def dedupe_candidates(candidates: Iterable[Candidate]) -> list[Candidate]:
    by_identifier: dict[str, Candidate] = {}

    for candidate in candidates:
        existing = by_identifier.get(candidate.identifier)

        if existing is None:
            by_identifier[candidate.identifier] = candidate
            continue

        merged_deadlines = sorted(
            set(existing.deadlines + candidate.deadlines)
        )
        existing.deadlines = merged_deadlines

        # Merge metadata conservatively so duplicate SEDIA search hits do not
        # cause loss of potentially useful eligibility evidence.
        for key, value in candidate.metadata.items():
            if key not in existing.metadata or not existing.metadata[key]:
                existing.metadata[key] = value

    return list(by_identifier.values())


def dedupe(records: Iterable[dict]) -> list[dict]:
    by_url = {}
    for record in records:
        by_url[record["url"]] = record
    return list(by_url.values())


def run(debug: bool = False) -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    all_candidates: list[Candidate] = []

    for keyword in KEYWORDS:
        print(f"[search] {keyword}")

        try:
            results = search_sedia(keyword)
        except Exception as exc:
            print(
                f"[search-error] {keyword}: {exc}",
                file=sys.stderr,
            )
            continue

        found = []

        for item in results:
            candidate = candidate_from_result(item, keyword)
            if candidate:
                found.append(candidate)

        print(
            f"  API results: {len(results)} · "
            f"future candidates: {len(found)}"
        )

        all_candidates.extend(found)

    unique_candidates = dedupe_candidates(all_candidates)

    accepted = []
    review = []

    for candidate in unique_candidates:
        try:
            record, evidence = verify_candidate(candidate)

            if record:
                accepted.append(record)
                print(f"[verified] {record['title']}")
            else:
                review.append(
                    {
                        **asdict(candidate),
                        "verification": evidence,
                    }
                )
                print(f"[review] {candidate.title}")

        except Exception as exc:
            review.append(
                {
                    **asdict(candidate),
                    "error": str(exc),
                }
            )
            print(
                f"[error] {candidate.title}: {exc}",
                file=sys.stderr,
            )

    accepted = dedupe(accepted)

    if debug:
        print()
        print(
            f"[debug] unique candidates: "
            f"{len(unique_candidates)}"
        )
        print(
            "[debug] no files written "
            "(safe diagnostic mode)"
        )
        return 0

    INBOX_PATH.write_text(
        json.dumps(
            accepted,
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    REVIEW_PATH.write_text(
        json.dumps(
            review,
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(
        f"Wrote {len(accepted)} verified records -> "
        f"{INBOX_PATH}"
    )
    print(
        f"Wrote {len(review)} review records -> "
        f"{REVIEW_PATH}"
    )

    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--debug",
        action="store_true",
        help=(
            "run SEDIA discovery and verification "
            "without writing inbox/review files"
        ),
    )
    args = parser.parse_args()
    return run(debug=args.debug)


if __name__ == "__main__":
    raise SystemExit(main())
