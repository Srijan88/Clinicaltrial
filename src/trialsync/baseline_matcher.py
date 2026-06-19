"""Deterministic baseline matcher.

NOT the real engine. This is a transparent, rule-based checker that evaluates a
patient's structured profile against each trial's structured criteria. It exists
so the data layer is verifiable end-to-end WITHOUT any LLM. In a later milestone
the Band multi-agent layer REPLACES this module — the agents will reason over the
same curated.json / patient JSON / biomarkers.json this layer produces, so the
data contract here is what matters going forward.

Verdict model
-------------
Per criterion -> "pass" | "fail".
  - inclusion: condition true => pass; otherwise fail.
  - exclusion: disqualifying condition true => fail; otherwise pass.

Overall lane:
  - any "fail" => "no_match"
  - else       => "match"

Every lever required by a criterion must resolve to a definite value. A missing
lever value on the patient counts as a FAIL for the criterion that needs it
(not an "unknown") — the data layer makes binary decisions only.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .schema import Criterion, Patient, Trial

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"

Verdict = str  # "pass" | "fail"
Lane = str     # "match" | "no_match"


# --- Loaders ----------------------------------------------------------------

def load_trials() -> list[Trial]:
    raw = json.loads((DATA / "trials" / "curated.json").read_text(encoding="utf-8"))
    return [Trial(**t) for t in raw]


def load_patient(patient_id: str) -> Patient:
    """Load a patient by id. Accepts 'P001' or a full filename stem."""
    patients_dir = DATA / "patients"
    for path in sorted(patients_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("patientId") == patient_id or path.stem.startswith(patient_id):
            return Patient(**data)
    raise FileNotFoundError(f"No patient file found for id {patient_id!r}")


# --- Evaluation -------------------------------------------------------------

def _apply_operator(op: str, patient_value, target) -> bool:
    if op == "==":
        return patient_value == target
    if op == "!=":
        return patient_value != target
    if op == "in":
        return patient_value in target
    if op == "not_in":
        return patient_value not in target
    if op == ">=":
        return patient_value >= target
    if op == "<=":
        return patient_value <= target
    if op == ">":
        return patient_value > target
    if op == "<":
        return patient_value < target
    raise ValueError(f"Unknown operator: {op}")


@dataclass
class CriterionResult:
    criterion: Criterion
    verdict: Verdict
    patient_value: object
    detail: str


@dataclass
class TrialResult:
    trial: Trial
    results: list[CriterionResult]
    lane: Lane


def evaluate_criterion(criterion: Criterion, patient: Patient) -> CriterionResult:
    pv = patient.lever_value(criterion.lever)

    # Missing lever value => the patient cannot demonstrate eligibility for the
    # criterion, so the criterion fails. The data layer makes binary decisions
    # only; there is no "unknown" verdict.
    if pv is None:
        return CriterionResult(
            criterion=criterion,
            verdict="fail",
            patient_value=pv,
            detail=f"{criterion.lever} missing on patient -> fail",
        )

    condition = _apply_operator(criterion.operator, pv, criterion.value)

    if criterion.type == "inclusion":
        verdict = "pass" if condition else "fail"
    else:  # exclusion: matching the disqualifying condition is a fail
        verdict = "fail" if condition else "pass"

    detail = (
        f"{criterion.lever}={pv!r} {criterion.operator} {criterion.value!r} "
        f"-> {condition}"
    )
    return CriterionResult(
        criterion=criterion,
        verdict=verdict,
        patient_value=pv,
        detail=detail,
    )


def overall_lane(results: list[CriterionResult]) -> Lane:
    if any(r.verdict == "fail" for r in results):
        return "no_match"
    return "match"


def evaluate_trial(trial: Trial, patient: Patient) -> TrialResult:
    results = [evaluate_criterion(c, patient) for c in trial.criteria]
    return TrialResult(trial=trial, results=results, lane=overall_lane(results))


def match_patient(patient: Patient, trials: list[Trial] | None = None) -> list[TrialResult]:
    if trials is None:
        trials = load_trials()
    return [evaluate_trial(t, patient) for t in trials]
