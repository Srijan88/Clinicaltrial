"""Deterministic LangChain tools the Band agents call.

CORE DESIGN RULE: the match/no_match verdict and per-criterion pass/fail are
computed HERE, deterministically, by reusing baseline_matcher. The LLM agents
call these tools and then write human-readable reasoning around the results — they
never compute or override a verdict themselves.

Each tool returns a JSON string (LLMs consume strings reliably).
"""

from __future__ import annotations

import json
from pathlib import Path

from langchain_core.tools import tool

from .baseline_matcher import load_patient, load_trials, match_patient

RESULTS_DIR = Path(__file__).resolve().parents[2] / "data" / "cache" / "agent_results"


@tool
def get_patient_summary(patient_id: str) -> str:
    """Load a synthetic patient by id (e.g. 'P001') and return a normalized,
    structured clinical summary as JSON: receptor statuses, derived hr_status and
    subtype, ECOG, labs, prior therapies, and flags. Use this to introduce the
    patient to the room."""
    p = load_patient(patient_id)
    summary = {
        "patientId": p.patientId,
        "age": p.age,
        "sex": p.sex,
        "diagnosis": p.diagnosis,
        "stage": p.stage,
        "er_status": p.er_status,
        "pr_status": p.pr_status,
        "her2_status": p.her2_status,
        "ar_status": p.ar_status,
        "hr_status": p.hr_status,
        "subtype": p.subtype,
        "ecog": p.ecog,
        "labs": p.labs.model_dump(),
        "on_cdk46_inhibitor": p.on_cdk46_inhibitor,
        "durable_disease_control": p.durable_disease_control,
        "brainMets": p.brainMets,
        "priorTherapies": [pt.model_dump() for pt in p.priorTherapies],
        "location": p.location,
    }
    return json.dumps(summary)


@tool
def list_candidate_trials() -> str:
    """Return all curated breast-cancer trials as candidates (nctId, title,
    phase, conditions). For this milestone every curated trial is a candidate.
    Returns JSON list."""
    trials = load_trials()
    out = [
        {
            "nctId": t.nctId,
            "title": t.title,
            "phase": t.phase,
            "conditions": t.conditions,
        }
        for t in trials
    ]
    return json.dumps(out)


@tool
def get_trial_criteria(nct_id: str) -> str:
    """Return a trial's verbatim rawCriteria text plus its structured curated
    eligibility levers (the source of truth). Use this to restate eligibility in
    clean structured form. Returns JSON."""
    trials = {t.nctId: t for t in load_trials()}
    t = trials.get(nct_id)
    if t is None:
        return json.dumps({"error": f"unknown nctId {nct_id}"})
    return json.dumps({
        "nctId": t.nctId,
        "title": t.title,
        "rawCriteria": t.rawCriteria,
        "criteria": [c.model_dump() for c in t.criteria],
    })


@tool
def compute_trial_verdicts(patient_id: str) -> str:
    """DETERMINISTIC SOURCE OF TRUTH. For the given patient, compute the
    match/no_match lane for every trial and pass/fail for every criterion, using
    the curated structured levers. Returns JSON you must NOT override — only
    explain. Shape:
    {"patientId": "...", "trials": [
       {"nctId": "...", "title": "...", "lane": "match|no_match",
        "criteria": [{"index": 0, "text": "...", "type": "inclusion",
                      "lever": "...", "verdict": "pass|fail", "detail": "..."}]}]}"""
    patient = load_patient(patient_id)
    results = match_patient(patient)
    trials = []
    for tr in results:
        trials.append({
            "nctId": tr.trial.nctId,
            "title": tr.trial.title,
            "lane": tr.lane,
            "criteria": [
                {
                    "index": i,
                    "text": r.criterion.text,
                    "type": r.criterion.type,
                    "lever": r.criterion.lever,
                    "verdict": r.verdict,
                    "detail": r.detail,
                }
                for i, r in enumerate(tr.results)
            ],
        })
    return json.dumps({"patientId": patient.patientId, "trials": trials})


@tool
def publish_result(patient_id: str, result_json: str) -> str:
    """Publish the FINAL TrialSync result so the CLI/orchestrator can pick it up.

    `result_json` must be the complete result object as a JSON string (the same
    object you also post to the room): {"patientId", "trials": [{nctId, title,
    lane, explanation, criteria:[{index, text, type, verdict, rationale}]}]}.
    The orchestrator cannot read the room (the Band Human API needs an Enterprise
    plan), so this tool writes the result to a local file the CLI reads. Call this
    EXACTLY ONCE as your final step, after posting your summary to the room."""
    try:
        parsed = json.loads(result_json)
    except json.JSONDecodeError as err:
        return f"ERROR: result_json is not valid JSON ({err}). Fix and retry."
    pid = parsed.get("patientId") or patient_id
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    path = RESULTS_DIR / f"{pid}.json"
    path.write_text(json.dumps(parsed, indent=2), encoding="utf-8")
    return f"published result for {pid}"
