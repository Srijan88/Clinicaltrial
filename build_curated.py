"""Build data/trials/curated.json from the raw seeded trials.

Run after fetch_trials.py:

    uv run python build_curated.py

The structured `criteria` levers below are HAND-ENCODED paraphrases of the key
eligibility points for each trial (Task 3). The verbatim protocol text is copied
unchanged into `rawCriteria` straight from the raw API response, so nothing is
fabricated. Re-run any time the raw files are re-seeded.
"""

from __future__ import annotations

import json
from pathlib import Path

from trialsync.schema import Trial

ROOT = Path(__file__).resolve().parent
RAW_DIR = ROOT / "data" / "trials" / "raw"
OUT = ROOT / "data" / "trials" / "curated.json"


def raw(nct_id: str) -> dict:
    return json.loads((RAW_DIR / f"{nct_id}.json").read_text(encoding="utf-8"))


def meta(study: dict) -> dict:
    ps = study["protocolSection"]
    return {
        "title": ps["identificationModule"].get("briefTitle", ""),
        "phase": ",".join(ps.get("designModule", {}).get("phases", [])) or None,
        "status": ps["statusModule"]["overallStatus"],
        "conditions": ps.get("conditionsModule", {}).get("conditions", []),
        "rawCriteria": ps.get("eligibilityModule", {}).get("eligibilityCriteria", ""),
        "detailsUrl": f"https://clinicaltrials.gov/study/{ps['identificationModule']['nctId']}",
    }


# --- Hand-encoded structured criteria (paraphrased levers) ------------------

CRITERIA = {
    "NCT06207734": [
        {"id": "734-i1", "text": "Hormone-receptor positive (ER+) disease",
         "type": "inclusion", "lever": "hr_status", "operator": "==", "value": "positive"},
        {"id": "734-i2", "text": "HER2 negative / zero disease",
         "type": "inclusion", "lever": "her2_status", "operator": "in", "value": ["negative", "zero"]},
        {"id": "734-i3", "text": "On a CDK4/6 inhibitor (with endocrine therapy)",
         "type": "inclusion", "lever": "on_cdk46_inhibitor", "operator": "==", "value": True},
        {"id": "734-i4", "text": "Durable disease control on CDK4/6i for >=12 months",
         "type": "inclusion", "lever": "durable_disease_control", "operator": "==", "value": True},
        {"id": "734-i5", "text": "ECOG performance status 0 or 1",
         "type": "inclusion", "lever": "ecog", "operator": "in", "value": [0, 1]},
    ],
    "NCT04360941": [
        {"id": "941-i1", "text": "Estrogen receptor negative (defines TNBC)",
         "type": "inclusion", "lever": "er_status", "operator": "==", "value": "negative"},
        {"id": "941-i2", "text": "Progesterone receptor negative (defines TNBC)",
         "type": "inclusion", "lever": "pr_status", "operator": "==", "value": "negative"},
        {"id": "941-i3", "text": "HER2 negative / zero (defines TNBC)",
         "type": "inclusion", "lever": "her2_status", "operator": "in", "value": ["zero", "negative"]},
        {"id": "941-i4", "text": "Androgen receptor positive (AR+)",
         "type": "inclusion", "lever": "ar_status", "operator": "==", "value": "positive"},
        {"id": "941-i5", "text": "Measurable metastatic disease (RECIST 1.1)",
         "type": "inclusion", "lever": "measurable_disease", "operator": "==", "value": "present"},
    ],
    "NCT06157892": [
        {"id": "892-i1", "text": "HER2-expressing disease (HER2-positive or HER2-low)",
         "type": "inclusion", "lever": "her2_status", "operator": "in", "value": ["positive", "low"]},
        {"id": "892-i2", "text": "Metastatic / locally-advanced breast cancer",
         "type": "inclusion", "lever": "metastatic_disease", "operator": "==", "value": "present"},
        {"id": "892-i3", "text": "ECOG performance status 0 or 1",
         "type": "inclusion", "lever": "ecog", "operator": "in", "value": [0, 1]},
    ],
}


def main() -> int:
    trials = []
    for nct_id, criteria in CRITERIA.items():
        m = meta(raw(nct_id))
        trial = Trial(nctId=nct_id, criteria=criteria, **m)
        trials.append(trial.model_dump())
    OUT.write_text(json.dumps(trials, indent=2), encoding="utf-8")
    print(f"Wrote {len(trials)} curated trials -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
