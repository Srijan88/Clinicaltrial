# TrialSync — Data Foundation (Milestone 1)

The deterministic **data layer** for TrialSync, a multi-agent clinical trial
matching system. This milestone is **DATA ONLY**: no agents, no Band
integration, no FastAPI, no login, no LLM calls. Later milestones consume the
artifacts produced here.

## Scope

- **Disease:** Stage IV (metastatic) breast cancer.
- **Trials:** REAL, fetched from [ClinicalTrials.gov](https://clinicaltrials.gov)
  v2 API and cached locally.
- **Patients:** 100% SYNTHETIC, authored by hand for demo purposes.

## ⚠️ NO-PHI Note

This repository contains **no Protected Health Information (PHI)**. Every patient
profile under `data/patients/` is **synthetic** and does not correspond to any
real person. Trial data is public information from ClinicalTrials.gov. Do not add
real patient data to this repository.

## Requirements

- Python 3.11+
- [`uv`](https://docs.astral.sh/uv/) for env/dependency management.

```bash
uv sync
```

## The two lanes

The deterministic baseline matcher places each (patient, trial) pair into one of
two lanes:

| Lane         | Meaning                                                            |
|--------------|--------------------------------------------------------------------|
| `match`      | Every inclusion criterion passes and no exclusion criterion triggers. |
| `no_match`   | At least one criterion fails.                                       |

Verdict rules: an inclusion criterion passes when its condition holds and fails
otherwise; an exclusion criterion fails when its disqualifying condition holds.
Every lever required by a criterion must resolve to a definite value — if the
patient lacks data for that lever, the criterion is treated as a **fail**. The
matcher returns binary verdicts only.

## Usage

```bash
uv run trialsync match P001   # -> NCT06207734 = match; others no_match
uv run trialsync match P002   # -> all trials no_match
uv run trialsync match P003   # -> NCT06157892 = match; others no_match
```

Each run prints, for every trial, the per-criterion verdict (`PASS`/`FAIL`) and
the overall lane. **No network call happens at match time** — everything loads
from local files.

> **Milestone 2 (Band multi-agent layer)** adds `uv run trialsync match-agents
> <patientId>`, which runs a four-agent Band choreography that produces the same
> deterministic lanes plus LLM-written per-criterion rationale. The verdict stays
> deterministic; the agents only explain it. See [SETUP.md](SETUP.md) for how to
> start the agents and the credentials it needs. The `match` command above
> remains the deterministic offline fallback.

## Re-seeding the trial data

The raw API responses are committed under `data/trials/raw/`. The demo must never
depend on a live call. To refresh them:

```bash
uv run python -m trialsync.fetch_trials   # writes data/trials/raw/{nctId}.json
uv run python build_curated.py            # rebuilds data/trials/curated.json
```

`fetch_trials.py` fetches each target trial from the single-study endpoint with a
1–2s delay and retry/backoff, asserts `overallStatus == "RECRUITING"`, and — if a
trial is no longer recruiting — logs a warning and searches the recruiting
metastatic-breast-cancer list for a same-subtype replacement.

### Trial substitutions

**None.** As of the last seed (2026-06-13), all three target trials were
`RECRUITING`, so no substitution was made:

| NCT          | Subtype focus                  | Status     |
|--------------|--------------------------------|------------|
| NCT06207734  | HR+/HER2− (CDK4/6 inhibitor)   | RECRUITING |
| NCT04360941  | AR+ triple-negative            | RECRUITING |
| NCT06157892  | HER2-expressing (HER2-low/+)   | RECRUITING |

## Repository layout

```
trialsync/
  data/
    trials/raw/           # raw API JSON, one file per NCT id (seeded once)
    trials/curated.json   # normalized trials + structured criteria levers
    patients/             # 3 synthetic patient profiles
    knowledge/            # curated biomarker fact sheet (biomarkers.json)
    clinicians/           # mock clinician identities (for later audit trail)
    cache/openfda/        # reserved for a later milestone
  src/trialsync/
    fetch_trials.py       # seeds raw trial JSON from ClinicalTrials.gov
    schema.py             # pydantic models + normalized lever vocabulary
    baseline_matcher.py   # DETERMINISTIC rule checker (replaced by agents later)
    cli.py                # `uv run trialsync match <patientId>`
  build_curated.py        # builds curated.json from raw + hand-encoded levers
  README.md
  pyproject.toml
```

## What the next milestone (the Band agent layer) inherits

- **`data/trials/curated.json`** — normalized `Trial` objects with structured,
  paraphrased `Criterion` levers plus verbatim `rawCriteria`.
- **`data/patients/*.json`** — synthetic `Patient` profiles with derived
  `hr_status`/`subtype` and a fixed-reference-date washout calculation.
- **`src/trialsync/schema.py`** — the shared pydantic contract and the controlled
  **lever vocabulary** every agent must speak.
- **`data/knowledge/biomarkers.json`** — plain-language biomarker fact sheet
  (HR/ER/PR, HER2, HER2-low, HER2-zero, AR).
- **`data/clinicians/clinicians.json`** — identity-only clinician records.

The `baseline_matcher.py` is intentionally simple and **will be replaced** by the
Band multi-agent layer; it exists only to make the data layer verifiable today.
