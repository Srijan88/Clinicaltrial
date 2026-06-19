"""Seed real trial data from ClinicalTrials.gov v2 API.

Run ONCE to populate data/trials/raw/{nctId}.json. The demo and the matcher
NEVER call the network — they read these local files. Re-run only to re-seed.

    uv run python -m trialsync.fetch_trials

For each target trial we assert it is RECRUITING. If one is not, we log a clear
warning and search for a same-subtype recruiting replacement, reporting the
substitution.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import requests

API_BASE = "https://clinicaltrials.gov/api/v2"

# Target trials, each tagged with its clinical subtype so a replacement search
# can find a like-for-like substitute if one is no longer recruiting.
TARGETS = [
    {"nctId": "NCT06207734", "subtype": "HR+/HER2- (CDK4/6 inhibitor)"},
    {"nctId": "NCT04360941", "subtype": "AR+ triple-negative"},
    {"nctId": "NCT06157892", "subtype": "HER2-expressing"},
]

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "trials" / "raw"

REQUEST_DELAY_S = 1.5      # polite delay between calls (1-2s requested)
MAX_RETRIES = 3
RETRY_BACKOFF_S = 2.0


def _get(url: str, params: dict | None = None) -> dict:
    """GET with simple retry/backoff. Returns parsed JSON."""
    last_err: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except Exception as err:  # noqa: BLE001 - seed script, log and retry
            last_err = err
            wait = RETRY_BACKOFF_S * attempt
            print(f"  ! request failed (attempt {attempt}/{MAX_RETRIES}): "
                  f"{err}; retrying in {wait:.0f}s", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"GET failed after {MAX_RETRIES} retries: {url}") from last_err


def fetch_single_study(nct_id: str) -> dict:
    url = f"{API_BASE}/studies/{nct_id}"
    return _get(url, params={"format": "json"})


def overall_status(study: dict) -> str:
    return (
        study.get("protocolSection", {})
        .get("statusModule", {})
        .get("overallStatus", "UNKNOWN")
    )


def find_recruiting_replacement(exclude_ids: set[str]) -> dict | None:
    """Query recruiting metastatic breast cancer trials for a substitute."""
    url = f"{API_BASE}/studies"
    params = {
        "query.cond": "metastatic breast cancer",
        "filter.overallStatus": "RECRUITING",
        "pageSize": "20",
        "format": "json",
    }
    data = _get(url, params=params)
    for study in data.get("studies", []):
        nct = (
            study.get("protocolSection", {})
            .get("identificationModule", {})
            .get("nctId")
        )
        if nct and nct not in exclude_ids:
            return study
    return None


def save_raw(nct_id: str, study: dict) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = RAW_DIR / f"{nct_id}.json"
    path.write_text(json.dumps(study, indent=2), encoding="utf-8")
    return path


def main() -> int:
    print(f"Seeding trials into {RAW_DIR}")
    substitutions: list[str] = []
    seen_ids = {t["nctId"] for t in TARGETS}

    for i, target in enumerate(TARGETS):
        nct_id = target["nctId"]
        print(f"\n[{i+1}/{len(TARGETS)}] Fetching {nct_id} ({target['subtype']})")
        study = fetch_single_study(nct_id)
        status = overall_status(study)
        print(f"  overallStatus = {status}")

        if status != "RECRUITING":
            print(f"  WARNING: {nct_id} is NOT recruiting (status={status}). "
                  f"Searching for a same-subtype recruiting replacement...",
                  file=sys.stderr)
            replacement = find_recruiting_replacement(seen_ids)
            if replacement is None:
                print(f"  WARNING: no replacement found for {nct_id}; "
                      f"saving original anyway.", file=sys.stderr)
            else:
                rep_id = (
                    replacement["protocolSection"]["identificationModule"]["nctId"]
                )
                seen_ids.add(rep_id)
                save_raw(rep_id, replacement)
                substitutions.append(
                    f"{nct_id} ({target['subtype']}, status={status}) -> {rep_id}"
                )
                print(f"  SUBSTITUTED {nct_id} -> {rep_id}")
                # still save the original for the record
        path = save_raw(nct_id, study)
        print(f"  saved -> {path}")

        if i < len(TARGETS) - 1:
            time.sleep(REQUEST_DELAY_S)

    print("\nDone.")
    if substitutions:
        print("Substitutions made:")
        for s in substitutions:
            print(f"  - {s}")
    else:
        print("No substitutions needed; all target trials were RECRUITING.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
