"""Isolated benchmark: which AI/ML model converges on the analyzer's task?

Reproduces the EXACT analyzer failure mode without touching the running agents
or agent_config.yaml. For each candidate model it runs the analyzer's real
ReAct tool-calling loop:

  system prompt = prompts/analyzer.md
  tools         = compute_trial_verdicts (real data), band_send_message,
                  publish_result   (stubbed side-effects)
  loop          = call model -> execute tool_calls -> feed results -> repeat,
                  capped at MAX_STEPS (mirrors LangGraph recursion_limit=50)

We measure: did it reach publish_result (converged)? in how many LLM steps?
how long? did it obey "call each tool once"? Run across P001/P002/P003 so we
cover different output sizes (match / all-no_match / match).

Nothing here modifies the live setup — the running analyzer keeps using
gpt-4o-mini. This only spends AI/ML quota for the probe.

Run:  uv run python test_analyzer_models.py
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from trialsync.agent_tools import compute_trial_verdicts

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

PROMPT = (ROOT / "prompts" / "analyzer.md").read_text(encoding="utf-8")

# Candidates to compare (baseline first). Unavailable ones are skipped.
CANDIDATES = [
    "gpt-4o-mini",   # current production analyzer (baseline)
    "gpt-4o",
    "gpt-4.1-mini",
    "gpt-4.1",
]

PATIENTS = ["P001", "P002", "P003"]
MAX_STEPS = 50  # mirrors agent_common.py recursion_limit for the analyzer

client = OpenAI(
    base_url=os.environ["AIML_BASE_URL"].rstrip("/"),
    api_key=os.environ["AIML_API_KEY"],
)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "compute_trial_verdicts",
            "description": "Deterministic source of truth: per-trial lane and per-criterion verdicts.",
            "parameters": {
                "type": "object",
                "properties": {"patient_id": {"type": "string"}},
                "required": ["patient_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "band_send_message",
            "description": "Post a message to the Band room. Requires >=1 mention.",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {"type": "string"},
                    "mentions": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["content", "mentions"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "publish_result",
            "description": "Publish the FINAL result so the CLI can read it. Call once, last.",
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {"type": "string"},
                    "result_json": {"type": "string"},
                },
                "required": ["patient_id", "result_json"],
            },
        },
    },
]


def _exec_tool(name: str, args: dict) -> str:
    """Execute a tool call. compute_trial_verdicts returns REAL data; the others
    are stubbed (we only care about whether/when the model calls them)."""
    if name == "compute_trial_verdicts":
        return compute_trial_verdicts.invoke({"patient_id": args.get("patient_id", "")})
    if name == "band_send_message":
        return json.dumps({"status": "sent"})
    if name == "publish_result":
        return f"published result for {args.get('patient_id', '')}"
    return json.dumps({"error": f"unknown tool {name}"})


def run_once(model: str, patient_id: str) -> dict:
    """Run the analyzer ReAct loop for one patient. Returns metrics."""
    trigger = (
        f"New TrialSync matching task. Match patient {patient_id} against all "
        f"curated trials. @analyzer please compute and explain the verdicts, then "
        f"post and publish the final result."
    )
    messages = [
        {"role": "system", "content": PROMPT},
        {"role": "user", "content": trigger},
    ]
    calls: dict[str, int] = {"compute_trial_verdicts": 0, "band_send_message": 0, "publish_result": 0}
    t0 = time.perf_counter()
    last_err = ""

    for step in range(1, MAX_STEPS + 1):
        try:
            resp = client.chat.completions.create(
                model=model, messages=messages, tools=TOOLS,
                tool_choice="auto", temperature=0.0, timeout=90,
            )
        except Exception as e:  # noqa: BLE001
            return {"converged": False, "steps": step, "secs": time.perf_counter() - t0,
                    "calls": calls, "note": f"api error: {str(e)[:80]}"}

        msg = resp.choices[0].message
        messages.append(msg.model_dump(exclude_none=True))

        if not msg.tool_calls:
            # Model produced final text with no publish_result -> stalled.
            note = "stopped without publish_result" if calls["publish_result"] == 0 else "ok-text-after-publish"
            return {"converged": calls["publish_result"] > 0, "steps": step,
                    "secs": time.perf_counter() - t0, "calls": calls, "note": note}

        for tc in msg.tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            calls[name] = calls.get(name, 0) + 1
            result = _exec_tool(name, args)
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
            if name == "publish_result":
                return {"converged": True, "steps": step, "secs": time.perf_counter() - t0,
                        "calls": calls, "note": "converged"}

    return {"converged": False, "steps": MAX_STEPS, "secs": time.perf_counter() - t0,
            "calls": calls, "note": f"hit MAX_STEPS ({MAX_STEPS}) — recursion-limit failure"}


def model_available(model: str) -> bool:
    try:
        client.chat.completions.create(
            model=model, messages=[{"role": "user", "content": "OK"}],
            max_tokens=3, temperature=0.0, timeout=30,
        )
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  [skip] {model}: {str(e)[:90]}")
        return False


def main() -> int:
    print(f"AI/ML base: {os.environ['AIML_BASE_URL']}")
    print(f"max steps per run: {MAX_STEPS}\n")
    rows = []
    for model in CANDIDATES:
        print(f"=== {model} ===")
        if not model_available(model):
            continue
        per = []
        for pid in PATIENTS:
            r = run_once(model, pid)
            per.append(r)
            flag = "OK " if r["converged"] else "FAIL"
            c = r["calls"]
            print(f"  {pid}: {flag} steps={r['steps']:>2} {r['secs']:>5.1f}s  "
                  f"compute×{c['compute_trial_verdicts']} send×{c['band_send_message']} "
                  f"publish×{c['publish_result']}  ({r['note']})")
        conv = sum(1 for r in per if r["converged"])
        avg_steps = sum(r["steps"] for r in per) / len(per)
        avg_secs = sum(r["secs"] for r in per) / len(per)
        rows.append((model, conv, len(per), avg_steps, avg_secs))
        print()

    print("=" * 64)
    print(f"{'model':<16}{'converged':<12}{'avg steps':<11}{'avg secs'}")
    print("-" * 64)
    for model, conv, total, avg_steps, avg_secs in rows:
        print(f"{model:<16}{f'{conv}/{total}':<12}{avg_steps:<11.1f}{avg_secs:.1f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
