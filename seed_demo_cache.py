"""Seed the demo-mode cache deterministically — no live agents required.

Writes data/cache/runs/{PID}.json = {"result", "transcript"} for each patient,
so `POST /api/v1/trials/find?mode=demo` can replay a clean run in ~30s even when
the Band room / Featherless quota is unavailable.

Determinism rule holds: the match/no_match lane and per-criterion pass/fail come
from baseline_matcher (the same source of truth the CLI and live API use). Only
the rationale/explanation prose and the room transcript are synthesized here, in
the same shape the live agents produce. This is a legitimate safety-net seed —
demo mode is explicitly a cached replay (Milestone 3, Task 2).

Run:  uv run python seed_demo_cache.py
"""

from __future__ import annotations

import json

from trialsync.api import RUNS_CACHE_DIR, build_result
from trialsync.baseline_matcher import load_patient, match_patient
from trialsync.schema import Patient

PATIENTS = ["P001", "P002", "P003"]

HANDLE_INTAKE = "@srijanmeh8/trialsync-intake"
HANDLE_DISCOVERER = "@srijanmeh8/trialsync-discoverer"
HANDLE_PARSER = "@srijanmeh8/trialsync-parser"
HANDLE_ANALYZER = "@srijanmeh8/trialsync-analyzer"


def _criterion_rationale(text: str, lever: str, pv, verdict: str, ctype: str) -> str:
    """Template rationale mirroring what the analyzer LLM writes."""
    val = pv if pv is not None else "missing"
    if verdict == "pass":
        return f"Patient's {lever} ({val}) meets the trial's requirement: {text.lower()}."
    return f"Patient's {lever} ({val}) does not meet the trial's requirement: {text.lower()}."


def _trial_explanation(lane: str) -> str:
    if lane == "match":
        return "Patient meets all eligibility criteria for this trial, indicating a good fit."
    return "Patient does not meet one or more eligibility criteria for this trial."


def _synth_agent_result(patient: Patient) -> dict:
    """Build an agent_result (rationale carrier) from deterministic verdicts."""
    results = match_patient(patient)
    trials = []
    for tr in results:
        crits = []
        for i, r in enumerate(tr.results):
            crits.append({
                "index": i,
                "rationale": _criterion_rationale(
                    r.criterion.text, r.criterion.lever, r.patient_value,
                    r.verdict, r.criterion.type),
            })
        trials.append({
            "nctId": tr.trial.nctId,
            "explanation": _trial_explanation(tr.lane),
            "criteria": crits,
        })
    return {"patientId": patient.patientId, "trials": trials}


def _synth_transcript(patient: Patient, result: dict) -> list[dict]:
    """Synthesize the 5 canonical room messages in the live agents' format."""
    pid = patient.patientId
    base = "2026-06-14T12:00:0"
    trials = result["trials"]

    intake_body = (
        f"Patient {pid} intake:\n"
        f"- Subtype: {patient.subtype}\n"
        f"- HR/ER/PR: {patient.hr_status}/{patient.er_status}/{patient.pr_status}\n"
        f"- HER2: {patient.her2_status}\n"
        f"- AR: {patient.ar_status}\n"
        f"- ECOG: {patient.ecog}\n"
        f"- Labs: ANC {patient.labs.anc}, Hgb {patient.labs.hgb}, Plt {patient.labs.platelets}\n"
        f"- On CDK4/6 inhibitor: {patient.on_cdk46_inhibitor}\n"
        f"- Brain mets: {patient.brainMets}\n"
        f"{HANDLE_DISCOVERER} please find candidate trials."
    )
    candidates_body = f"Patient {pid} candidates:\n" + "\n".join(
        f"- {t['nctId']}: {t['title']}" for t in trials
    ) + f"\n{HANDLE_PARSER} please restate the eligibility constraints."
    constraints_body = f"Patient {pid} eligibility constraints:\n" + "\n".join(
        f"- {t['nctId']}: " + "; ".join(c["text"] for c in t["criteria"])
        for t in trials
    ) + f"\n{HANDLE_ANALYZER} please compute and explain the verdicts."
    analyzer_body = (
        f"Final result for {pid}:\n"
        f"===TRIALSYNC_RESULT_BEGIN===\n{json.dumps(result)}\n===TRIALSYNC_RESULT_END===\n@owner"
    )

    rows = [
        ("orchestrator", "orchestrator",
         f"{HANDLE_INTAKE} New TrialSync matching task. Match patient {pid} against all curated trials."),
        ("intake", "srijanmeh8/trialsync-intake", intake_body),
        ("discoverer", "srijanmeh8/trialsync-discoverer", candidates_body),
        ("parser", "srijanmeh8/trialsync-parser", constraints_body),
        ("analyzer", "srijanmeh8/trialsync-analyzer", analyzer_body),
    ]
    return [
        {
            "id": f"seed-{pid}-{i}",
            "author_role": role,
            "author_handle": handle,
            "text": text,
            "posted_at": f"{base}{i}+00:00",
        }
        for i, (role, handle, text) in enumerate(rows)
    ]


def seed(pid: str) -> dict:
    patient = load_patient(pid)
    agent_result = _synth_agent_result(patient)
    result = build_result(pid, agent_result)
    transcript = _synth_transcript(patient, result)
    RUNS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (RUNS_CACHE_DIR / f"{pid}.json").write_text(
        json.dumps({"result": result, "transcript": transcript}, indent=2),
        encoding="utf-8",
    )
    lanes = {t["nctId"]: t["lane"] for t in result["trials"]}
    return lanes


if __name__ == "__main__":
    for p in PATIENTS:
        lanes = seed(p)
        print(f"seeded {p}: {lanes}")
