"""TrialSync CLI.

    uv run trialsync match <patientId>          # deterministic, offline
    uv run trialsync match-agents <patientId>   # Band multi-agent choreography

`match` is the deterministic offline fallback. `match-agents` runs the Band
agent pipeline (intake -> discoverer -> parser -> analyzer) to produce
LLM-written per-criterion rationale. In BOTH commands the match/no_match verdict
is the deterministic one computed from curated levers — the LLM never overrides
it; in match-agents it only adds rationale.
"""

from __future__ import annotations

import argparse
import sys

from .baseline_matcher import load_patient, match_patient

LANE_LABEL = {
    "match": "MATCH",
    "no_match": "NO_MATCH",
}

VERDICT_MARK = {"pass": "PASS", "fail": "FAIL"}


def cmd_match(patient_id: str) -> int:
    try:
        patient = load_patient(patient_id)
    except FileNotFoundError as err:
        print(f"error: {err}", file=sys.stderr)
        return 2

    results = match_patient(patient)

    print(f"Patient {patient.patientId}  "
          f"(subtype={patient.subtype}, hr={patient.hr_status}, "
          f"her2={patient.her2_status}, ecog={patient.ecog})")
    print("=" * 72)

    for tr in results:
        print(f"\n{tr.trial.nctId}  [{LANE_LABEL[tr.lane]}]")
        print(f"  {tr.trial.title}")
        for r in tr.results:
            mark = VERDICT_MARK[r.verdict]
            print(f"    [{mark}] ({r.criterion.type[:4]}) "
                  f"{r.criterion.text}")
            print(f"           {r.detail}")

    print("\n" + "-" * 72)
    print("Summary:")
    for tr in results:
        print(f"  {tr.trial.nctId}: {LANE_LABEL[tr.lane]}")
    return 0


def _index_agent_rationale(agent_result: dict) -> dict:
    """Map (nctId, criterion index) -> rationale, and nctId -> overall explanation."""
    crit_rationale: dict[tuple[str, int], str] = {}
    trial_expl: dict[str, str] = {}
    for tr in agent_result.get("trials", []):
        nct = tr.get("nctId", "")
        trial_expl[nct] = tr.get("explanation", "")
        for c in tr.get("criteria", []):
            idx = c.get("index")
            if isinstance(idx, int):
                crit_rationale[(nct, idx)] = c.get("rationale", "")
    return {"criteria": crit_rationale, "trials": trial_expl}


def cmd_match_agents(patient_id: str, timeout_s: int) -> int:
    try:
        patient = load_patient(patient_id)
    except FileNotFoundError as err:
        print(f"error: {err}", file=sys.stderr)
        return 2

    # Deterministic verdicts are the source of truth (computed offline).
    results = match_patient(patient)

    # Run the Band choreography to obtain LLM rationale.
    print(f"Running Band agent pipeline for {patient_id} "
          f"(timeout {timeout_s}s)...", file=sys.stderr)
    try:
        from .run_agents import run as run_pipeline
        agent_result = run_pipeline(patient_id, timeout_s=timeout_s)
    except Exception as err:  # noqa: BLE001 - surface any pipeline failure clearly
        print(f"error: agent pipeline failed: {err}", file=sys.stderr)
        print("Tip: ensure the four agent processes are running (scripts/"
              "start_agents.ps1) and .env is present.", file=sys.stderr)
        return 1

    rationale = _index_agent_rationale(agent_result)

    print(f"\nPatient {patient.patientId}  "
          f"(subtype={patient.subtype}, hr={patient.hr_status}, "
          f"her2={patient.her2_status}, ecog={patient.ecog})   [via Band agents]")
    print("=" * 72)

    for tr in results:
        nct = tr.trial.nctId
        print(f"\n{nct}  [{LANE_LABEL[tr.lane]}]")
        print(f"  {tr.trial.title}")
        expl = rationale["trials"].get(nct)
        if expl:
            print(f"  > {expl}")
        for i, r in enumerate(tr.results):
            mark = VERDICT_MARK[r.verdict]
            print(f"    - [{mark}] ({r.criterion.type[:4]}) {r.criterion.text}")
            why = rationale["criteria"].get((nct, i))
            if why:
                print(f"      rationale: {why}")

    print("\n" + "-" * 72)
    print("Summary (deterministic verdict; rationale by LLM):")
    for tr in results:
        print(f"  {tr.trial.nctId}: {LANE_LABEL[tr.lane]}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="trialsync")
    sub = parser.add_subparsers(dest="command", required=True)

    p_match = sub.add_parser("match", help="Deterministic offline match")
    p_match.add_argument("patientId", help="e.g. P001, P002, P003")

    p_agents = sub.add_parser(
        "match-agents", help="Match via the Band multi-agent pipeline (needs agents running)")
    p_agents.add_argument("patientId", help="e.g. P001, P002, P003")
    p_agents.add_argument("--timeout", type=int, default=180,
                          help="seconds to wait for the analyzer result (default 180)")

    p_serve = sub.add_parser(
        "serve", help="Run the FastAPI backend (Milestone 3 web demo) on :8000")
    p_serve.add_argument("--host", default="0.0.0.0")
    p_serve.add_argument("--port", type=int, default=8000)

    args = parser.parse_args(argv)

    if args.command == "match":
        return cmd_match(args.patientId)
    if args.command == "match-agents":
        return cmd_match_agents(args.patientId, args.timeout)
    if args.command == "serve":
        from .api import serve
        serve(host=args.host, port=args.port)
        return 0
    parser.error(f"unknown command {args.command!r}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
