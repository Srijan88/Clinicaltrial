"""Step-by-step pipeline health check for TrialSync (Milestone 2).

TEMPORARY — delete once we're confident the pipeline is healthy. Each step is
a small, isolated function so we can run them one at a time:

    uv run python check_pipeline.py step1   # env-vars only, no network
    uv run python check_pipeline.py step2   # Featherless model probe

Steps are designed cheapest-to-fail-first so we don't burn tokens or send
@-mentions to agents until the basics check out.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"

# Every key we expect to use across the whole pipeline. Grouped for readable
# diagnostics. The "kind" tag controls how we mask the value when printing.
REQUIRED_ENV = [
    # Band orchestrator + room
    ("BAND_API_KEY",              "secret"),
    ("BAND_ROOM_ID",              "id"),
    # Per-agent Band credentials
    ("BAND_AGENT_ID_INTAKE",      "id"),
    ("BAND_AGENT_KEY_INTAKE",     "secret"),
    ("BAND_AGENT_ID_PARSER",      "id"),
    ("BAND_AGENT_KEY_PARSER",     "secret"),
    ("BAND_AGENT_ID_DISCOVERER",  "id"),
    ("BAND_AGENT_KEY_DISCOVERER", "secret"),
    ("BAND_AGENT_ID_ANALYZER",    "id"),
    ("BAND_AGENT_KEY_ANALYZER",   "secret"),
    # @-handles
    ("HANDLE_INTAKE",             "plain"),
    ("HANDLE_PARSER",             "plain"),
    ("HANDLE_DISCOVERER",         "plain"),
    ("HANDLE_ANALYZER",           "plain"),
    # Model providers
    ("FEATHERLESS_API_KEY",       "secret"),
    ("FEATHERLESS_BASE_URL",      "plain"),
    ("AIML_API_KEY",              "secret"),
    ("AIML_BASE_URL",             "plain"),
]


def _mask(value: str, kind: str) -> str:
    """Show enough to identify a value without leaking the secret."""
    if not value:
        return "<MISSING>"
    if kind == "plain":
        return value
    if kind == "id":
        # UUIDs / room ids — first 8 chars is plenty.
        return f"{value[:8]}…"
    # secret: show prefix (e.g. band_a_, band_u_, rc_, sk-) + length only.
    prefix = value.split("_", 2)[:2]
    head = "_".join(prefix) + "_" if len(prefix) == 2 and "_" in value else value[:4]
    return f"{head}… (len={len(value)})"


def step1() -> int:
    """Load .env and verify every required variable is present.

    Returns 0 on success, 1 on failure. No network calls.
    """
    print(f"[step1] loading {ENV_PATH}")
    if not ENV_PATH.exists():
        print(f"[step1] FAIL: .env not found at {ENV_PATH}")
        return 1
    load_dotenv(ENV_PATH, override=True)

    missing: list[str] = []
    for name, kind in REQUIRED_ENV:
        value = os.environ.get(name, "")
        if not value:
            missing.append(name)
            print(f"  {name:30s} = <MISSING>")
        else:
            print(f"  {name:30s} = {_mask(value, kind)}")

    if missing:
        print(f"\n[step1] FAIL: {len(missing)} missing var(s): {', '.join(missing)}")
        return 1
    print(f"\n[step1] OK: {len(REQUIRED_ENV)} env vars present.")
    return 0


# ---------------------------------------------------------------------------
# Step 2 — Featherless candidate-elimination probe
# ---------------------------------------------------------------------------

# Try in this order; stop at the first that passes BOTH probes.
# Rationale: 14B is the cheapest unit cost / lowest latency; 70B is the safest
# big fallback; 32B is the middle ground.
FEATHERLESS_CANDIDATES = [
    "Qwen/Qwen2.5-14B-Instruct",
    "meta-llama/Llama-3.3-70B-Instruct",
    "Qwen/Qwen2.5-32B-Instruct",
]

# Tool definition used for the tool-calling probe. Mirrors the shape of the
# real handoff calls the intake/discoverer/parser agents make: a single string
# arg representing a Band @-handle.
PROBE_TOOL = {
    "type": "function",
    "function": {
        "name": "route_to",
        "description": "Hand off to the next agent by their @-handle.",
        "parameters": {
            "type": "object",
            "properties": {
                "handle": {
                    "type": "string",
                    "description": "The next agent's handle, e.g. '@srijanmeh8/trialsync-discoverer'",
                },
            },
            "required": ["handle"],
        },
    },
}


def _featherless_chat(model: str, body: dict[str, Any], timeout: int = 60) -> tuple[int, dict[str, Any] | str]:
    """POST to {FEATHERLESS_BASE_URL}/chat/completions. Returns (status, json|text)."""
    base = os.environ["FEATHERLESS_BASE_URL"].rstrip("/")
    url = f"{base}/chat/completions"
    headers = {
        "Authorization": f"Bearer {os.environ['FEATHERLESS_API_KEY']}",
        "Content-Type": "application/json",
    }
    payload = {"model": model, **body}
    resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    try:
        return resp.status_code, resp.json()
    except ValueError:
        return resp.status_code, resp.text


def _probe_resolution(model: str) -> tuple[bool, str]:
    """Probe A: does the model resolve at all? Tiny one-token-ish completion."""
    body = {
        "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
        "max_tokens": 8,
        "temperature": 0.0,
    }
    t0 = time.perf_counter()
    status, data = _featherless_chat(model, body)
    elapsed = time.perf_counter() - t0
    if status == 200 and isinstance(data, dict):
        try:
            content = data["choices"][0]["message"]["content"]
            return True, f"resolved in {elapsed:.1f}s, said: {content!r}"
        except (KeyError, IndexError, TypeError):
            return False, f"200 but malformed response: {str(data)[:200]}"
    if status == 404:
        return False, f"404 — model not on this Featherless plan ({elapsed:.1f}s)"
    if status == 401:
        return False, f"401 — auth failed (FEATHERLESS_API_KEY rejected)"
    snippet = json.dumps(data)[:200] if isinstance(data, dict) else str(data)[:200]
    return False, f"HTTP {status} in {elapsed:.1f}s: {snippet}"


def _probe_tool_calling(model: str) -> tuple[bool, str]:
    """Probe B: can the model emit a structured tool_call? This is the failure
    mode that bit the 8B model in M2 (looped instead of calling a tool)."""
    body = {
        "messages": [
            {
                "role": "system",
                "content": "You are a router. Always respond by calling a tool — never with plain text.",
            },
            {
                "role": "user",
                "content": (
                    "Hand off to the discoverer agent. Their handle is "
                    "'@srijanmeh8/trialsync-discoverer'. Use the route_to tool."
                ),
            },
        ],
        "tools": [PROBE_TOOL],
        "tool_choice": "required",  # Force a tool call so we're testing the actual capability.
        "max_tokens": 128,
        "temperature": 0.0,
    }
    t0 = time.perf_counter()
    status, data = _featherless_chat(model, body)
    elapsed = time.perf_counter() - t0
    if status != 200 or not isinstance(data, dict):
        snippet = json.dumps(data)[:200] if isinstance(data, dict) else str(data)[:200]
        return False, f"HTTP {status} in {elapsed:.1f}s: {snippet}"
    try:
        msg = data["choices"][0]["message"]
        tool_calls = msg.get("tool_calls") or []
    except (KeyError, IndexError, TypeError):
        return False, f"malformed response: {str(data)[:200]}"
    if not tool_calls:
        # Some providers stuff the call into content for non-tool-trained models.
        content = (msg.get("content") or "")[:120]
        return False, f"no tool_calls field ({elapsed:.1f}s); content was: {content!r}"
    call = tool_calls[0]
    fn_name = (call.get("function") or {}).get("name", "")
    raw_args = (call.get("function") or {}).get("arguments", "")
    if fn_name != "route_to":
        return False, f"called wrong function: {fn_name!r} ({elapsed:.1f}s)"
    try:
        args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
    except json.JSONDecodeError:
        return False, f"tool args not valid JSON: {raw_args[:120]!r}"
    if "handle" not in args:
        return False, f"tool args missing 'handle' key: {args}"
    return True, f"tool_call OK in {elapsed:.1f}s, handle={args['handle']!r}"


def step2() -> int:
    """Probe Featherless candidate models in order, stop at first that passes
    both resolution and tool-calling probes. Does NOT modify agent_config.yaml.
    """
    if not ENV_PATH.exists():
        print(f"[step2] FAIL: .env not found at {ENV_PATH} — run step1 first")
        return 1
    load_dotenv(ENV_PATH, override=True)
    for var in ("FEATHERLESS_API_KEY", "FEATHERLESS_BASE_URL"):
        if not os.environ.get(var):
            print(f"[step2] FAIL: {var} missing — run step1 first")
            return 1

    print(f"[step2] base_url = {os.environ['FEATHERLESS_BASE_URL']}")
    print(f"[step2] candidates: {FEATHERLESS_CANDIDATES}\n")

    winner: str | None = None
    for model in FEATHERLESS_CANDIDATES:
        print(f"--- {model} ---")
        ok_a, msg_a = _probe_resolution(model)
        print(f"  [A] resolution:   {'PASS' if ok_a else 'FAIL'} — {msg_a}")
        if not ok_a:
            print("  -> rejected, trying next candidate\n")
            # 401 is fatal (key issue, not model issue) — abort the whole step.
            if "401" in msg_a:
                print("[step2] FAIL: auth error, aborting — fix FEATHERLESS_API_KEY first.")
                return 1
            continue
        ok_b, msg_b = _probe_tool_calling(model)
        print(f"  [B] tool-calling: {'PASS' if ok_b else 'FAIL'} — {msg_b}")
        if not ok_b:
            print("  -> rejected, trying next candidate\n")
            continue
        print(f"  -> ACCEPTED\n")
        winner = model
        break

    if winner is None:
        print("[step2] FAIL: no candidate passed both probes.")
        return 1

    print(f"[step2] OK: winner = {winner}")
    print(f"[step2] Not modifying agent_config.yaml yet — confirm and I'll wire it in.")
    return 0


# ---------------------------------------------------------------------------
# Step 3 — AI/ML API ping for the analyzer's gpt-4o-mini
# ---------------------------------------------------------------------------

# The analyzer is the one agent that actually drives tool calls in the live
# pipeline (compute_trial_verdicts, publish_result), so tool-calling has to work
# here even if it's a known-good model. Same shape as step2 to keep diagnostics
# consistent.
AIML_MODEL = "gpt-4o-mini"


def _aiml_chat(model: str, body: dict[str, Any], timeout: int = 60) -> tuple[int, dict[str, Any] | str]:
    """POST to {AIML_BASE_URL}/chat/completions. Returns (status, json|text)."""
    base = os.environ["AIML_BASE_URL"].rstrip("/")
    url = f"{base}/chat/completions"
    headers = {
        "Authorization": f"Bearer {os.environ['AIML_API_KEY']}",
        "Content-Type": "application/json",
    }
    payload = {"model": model, **body}
    resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    try:
        return resp.status_code, resp.json()
    except ValueError:
        return resp.status_code, resp.text


def _probe_aiml_resolution(model: str) -> tuple[bool, str]:
    body = {
        "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
        "max_tokens": 8,
        "temperature": 0.0,
    }
    t0 = time.perf_counter()
    status, data = _aiml_chat(model, body)
    elapsed = time.perf_counter() - t0
    if status == 200 and isinstance(data, dict):
        try:
            content = data["choices"][0]["message"]["content"]
            return True, f"resolved in {elapsed:.1f}s, said: {content!r}"
        except (KeyError, IndexError, TypeError):
            return False, f"200 but malformed response: {str(data)[:200]}"
    if status == 401:
        return False, f"401 — auth failed (AIML_API_KEY rejected)"
    if status == 404:
        return False, f"404 — model {model!r} not on this AI/ML plan ({elapsed:.1f}s)"
    snippet = json.dumps(data)[:200] if isinstance(data, dict) else str(data)[:200]
    return False, f"HTTP {status} in {elapsed:.1f}s: {snippet}"


def _probe_aiml_tool_calling(model: str) -> tuple[bool, str]:
    body = {
        "messages": [
            {
                "role": "system",
                "content": "You are a router. Always respond by calling a tool — never with plain text.",
            },
            {
                "role": "user",
                "content": (
                    "Hand off to the discoverer agent. Their handle is "
                    "'@srijanmeh8/trialsync-discoverer'. Use the route_to tool."
                ),
            },
        ],
        "tools": [PROBE_TOOL],
        "tool_choice": "required",
        "max_tokens": 128,
        "temperature": 0.0,
    }
    t0 = time.perf_counter()
    status, data = _aiml_chat(model, body)
    elapsed = time.perf_counter() - t0
    if status != 200 or not isinstance(data, dict):
        snippet = json.dumps(data)[:200] if isinstance(data, dict) else str(data)[:200]
        return False, f"HTTP {status} in {elapsed:.1f}s: {snippet}"
    try:
        msg = data["choices"][0]["message"]
        tool_calls = msg.get("tool_calls") or []
    except (KeyError, IndexError, TypeError):
        return False, f"malformed response: {str(data)[:200]}"
    if not tool_calls:
        content = (msg.get("content") or "")[:120]
        return False, f"no tool_calls field ({elapsed:.1f}s); content was: {content!r}"
    call = tool_calls[0]
    fn_name = (call.get("function") or {}).get("name", "")
    raw_args = (call.get("function") or {}).get("arguments", "")
    if fn_name != "route_to":
        return False, f"called wrong function: {fn_name!r} ({elapsed:.1f}s)"
    try:
        args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
    except json.JSONDecodeError:
        return False, f"tool args not valid JSON: {raw_args[:120]!r}"
    if "handle" not in args:
        return False, f"tool args missing 'handle' key: {args}"
    return True, f"tool_call OK in {elapsed:.1f}s, handle={args['handle']!r}"


def step3() -> int:
    """Probe AI/ML API gpt-4o-mini for resolution + tool-calling."""
    if not ENV_PATH.exists():
        print(f"[step3] FAIL: .env not found at {ENV_PATH} — run step1 first")
        return 1
    load_dotenv(ENV_PATH, override=True)
    for var in ("AIML_API_KEY", "AIML_BASE_URL"):
        if not os.environ.get(var):
            print(f"[step3] FAIL: {var} missing — run step1 first")
            return 1

    print(f"[step3] base_url = {os.environ['AIML_BASE_URL']}")
    print(f"[step3] model    = {AIML_MODEL}\n")

    ok_a, msg_a = _probe_aiml_resolution(AIML_MODEL)
    print(f"  [A] resolution:   {'PASS' if ok_a else 'FAIL'} — {msg_a}")
    if not ok_a:
        return 1
    ok_b, msg_b = _probe_aiml_tool_calling(AIML_MODEL)
    print(f"  [B] tool-calling: {'PASS' if ok_b else 'FAIL'} — {msg_b}")
    if not ok_b:
        return 1
    print(f"\n[step3] OK: {AIML_MODEL} reachable and tool-call capable.")
    return 0


# ---------------------------------------------------------------------------
# Step 5 — Band room write (non-destructive probe post)
# ---------------------------------------------------------------------------
# Posts a clearly-marked [probe] message that does NOT @-mention any agent,
# so it won't trigger the real pipeline. We post as the analyzer agent key
# (same as run_agents.py does for the kickoff message).

PROBE_CONTENT = "[probe] TrialSync pipeline check — ignore this message."


def step5() -> int:
    """Post a non-destructive probe message to the Band room.

    Uses the analyzer key (same poster as the real orchestrator). The message
    has no @mentions so no agent will pick it up and start processing.
    """
    if not ENV_PATH.exists():
        print(f"[step5] FAIL: .env not found — run step1 first")
        return 1
    load_dotenv(ENV_PATH, override=True)
    for var in ("BAND_AGENT_KEY_ANALYZER", "BAND_ROOM_ID"):
        if not os.environ.get(var):
            print(f"[step5] FAIL: {var} missing — run step1 first")
            return 1

    room = os.environ["BAND_ROOM_ID"]
    key  = os.environ["BAND_AGENT_KEY_ANALYZER"]
    url  = f"{BAND_REST_BASE}/agent/chats/{room}/messages"

    # Band requires ≥1 mention (SETUP.md note 6). We mention the intake agent —
    # if the intake process isn't running (expected at this stage) the message
    # just sits in its unread queue. The content is clearly marked [probe] and
    # doesn't match the real task format, so even a live intake agent would
    # ignore it. Run drain_backlog.py before step7 if you want a clean slate.
    intake_id     = os.environ.get("BAND_AGENT_ID_INTAKE", "")
    intake_handle = os.environ.get("HANDLE_INTAKE", "").lstrip("@")
    body = {
        "message": {
            "content": PROBE_CONTENT,
            "mentions": [{"id": intake_id, "handle": intake_handle}],
        }
    }
    headers = {"X-API-Key": key, "Content-Type": "application/json"}

    print(f"[step5] posting probe to room {room[:8]}…")
    print(f"[step5] content: {PROBE_CONTENT!r}")

    t0 = time.perf_counter()
    resp = requests.post(url, headers=headers, json=body, timeout=30)
    elapsed = time.perf_counter() - t0

    try:
        data = resp.json()
    except ValueError:
        data = resp.text

    if resp.status_code in (200, 201):
        # Extract message id if available for confirmation.
        msg_id = None
        if isinstance(data, dict):
            msg_id = (
                (data.get("data") or {}).get("id")
                or (data.get("message") or {}).get("id")
                or data.get("id")
            )
        id_str = f", message_id={str(msg_id)[:12]}" if msg_id else ""
        print(f"\n[step5] OK: room is writable (HTTP {resp.status_code} in {elapsed:.1f}s{id_str}).")
        return 0

    snippet = json.dumps(data)[:200] if isinstance(data, dict) else str(data)[:200]
    print(f"\n[step5] FAIL: HTTP {resp.status_code} in {elapsed:.1f}s — {snippet}")
    return 1


# ---------------------------------------------------------------------------
# Step 6 — Band room participants list
# ---------------------------------------------------------------------------
# GET /agent/chats/{room}/participants — shows who's in the room.
# Checks that all 4 agents are listed as participants.
# NOTE: "listed as participant" != "agent process is online". Online/offline
# status requires the WebSocket subscription layer. If an agent shows as a
# participant but its process isn't running, step7 (end-to-end) will time out.

EXPECTED_AGENT_IDS = [
    ("intake",     "BAND_AGENT_ID_INTAKE"),
    ("discoverer", "BAND_AGENT_ID_DISCOVERER"),
    ("parser",     "BAND_AGENT_ID_PARSER"),
    ("analyzer",   "BAND_AGENT_ID_ANALYZER"),
]


def step6() -> int:
    """List room participants and verify all 4 agents are in the room."""
    if not ENV_PATH.exists():
        print(f"[step6] FAIL: .env not found — run step1 first")
        return 1
    load_dotenv(ENV_PATH, override=True)
    room = os.environ.get("BAND_ROOM_ID")
    key  = os.environ.get("BAND_AGENT_KEY_ANALYZER")  # any agent key works
    if not room or not key:
        print("[step6] FAIL: BAND_ROOM_ID or BAND_AGENT_KEY_ANALYZER missing")
        return 1

    url = f"{BAND_REST_BASE}/agent/chats/{room}/participants"
    headers = {"X-API-Key": key}

    print(f"[step6] GET {url.replace(room, room[:8]+'…')}")
    t0 = time.perf_counter()
    resp = requests.get(url, headers=headers, timeout=30)
    elapsed = time.perf_counter() - t0

    try:
        data = resp.json()
    except ValueError:
        print(f"[step6] FAIL: HTTP {resp.status_code}, non-JSON body: {resp.text[:200]}")
        return 1

    if resp.status_code != 200:
        print(f"[step6] FAIL: HTTP {resp.status_code} in {elapsed:.1f}s — {json.dumps(data)[:200]}")
        return 1

    # Normalise — Band may return {"participants": [...]} or {"data": [...]}
    participants: list[dict] = (
        data.get("participants")
        or data.get("data")
        or (data if isinstance(data, list) else [])
    )

    print(f"[step6] {len(participants)} participant(s) in room ({elapsed:.1f}s):\n")
    participant_ids = set()
    for p in participants:
        pid  = str(p.get("id") or p.get("agent_id") or "")
        name = p.get("name") or p.get("handle") or p.get("username") or pid[:12]
        ptype = p.get("type") or p.get("role") or "?"
        print(f"  {name:40s}  type={ptype:8s}  id={pid[:8]}…")
        participant_ids.add(pid)

    print()
    missing: list[str] = []
    for role, env_key in EXPECTED_AGENT_IDS:
        agent_id = os.environ.get(env_key, "")
        found = agent_id in participant_ids
        status = "✓ found" if found else "✗ MISSING"
        print(f"  {role:11s} {status}  ({agent_id[:8]}…)")
        if not found:
            missing.append(role)

    print()
    if missing:
        print(f"[step6] FAIL: {len(missing)} agent(s) not in room: {', '.join(missing)}")
        print("[step6] Hint: add missing agents as participants via the Band UI or SDK.")
        return 1

    print("[step6] OK: all 4 agents are participants in the room.")
    print("[step6] Note: participant ≠ process online. If step7 times out, start")
    print("        the agent processes first:  .\\scripts\\start_agents.ps1")
    return 0


# ---------------------------------------------------------------------------
# Step 7 — Full end-to-end P001 run via Band agent pipeline
# ---------------------------------------------------------------------------
# What this does:
#   1. Drain any stale backlog so the probe message from step5 doesn't wake intake.
#   2. Run `match-agents P001` via run_agents.run() with a generous timeout.
#   3. Validate the result file against expected lanes for all 3 patients if cached.
#   4. Print a clear pass/fail summary mirroring cli.py's output.
#
# Requires: all 4 agent processes running (.\scripts\start_agents.ps1).
# Expected lanes (deterministic, from baseline_matcher):
#   P001: NCT06207734=match,  NCT04360941=no_match, NCT06157892=no_match
#   P002: all no_match
#   P003: NCT06207734=no_match, NCT04360941=no_match, NCT06157892=match
#
# NOTE: This step does a LIVE Band + LLM call. Runtime ~1–3 min on Qwen2.5-14B.

EXPECTED_LANES = {
    "P001": {"NCT06207734": "match",    "NCT04360941": "no_match", "NCT06157892": "no_match"},
    "P002": {"NCT06207734": "no_match", "NCT04360941": "no_match", "NCT06157892": "no_match"},
    "P003": {"NCT06207734": "no_match", "NCT04360941": "no_match", "NCT06157892": "match"},
}

STEP7_TIMEOUT = 240  # seconds — generous for 14B cold-start + 3-hop pipeline


def _drain_backlog_silent() -> int:
    """Drain unprocessed messages for all 4 agents. Returns count drained."""
    room = os.environ["BAND_ROOM_ID"]
    total = 0
    for _, env_key in BAND_AGENT_KEYS:
        key = os.environ.get(env_key, "")
        if not key:
            continue
        h = {"X-API-Key": key}
        while True:
            r = requests.get(
                f"{BAND_REST_BASE}/agent/chats/{room}/messages/next",
                headers=h, timeout=30,
            )
            if r.status_code == 204:
                break
            if r.status_code != 200:
                break
            msg = r.json().get("data") or r.json()
            mid = msg.get("id") if isinstance(msg, dict) else None
            if not mid:
                break
            requests.post(f"{BAND_REST_BASE}/agent/chats/{room}/messages/{mid}/processing",
                          headers=h, timeout=30)
            requests.post(f"{BAND_REST_BASE}/agent/chats/{room}/messages/{mid}/processed",
                          headers=h, timeout=30)
            total += 1
    return total


def _check_lanes(patient_id: str, result: dict) -> tuple[bool, list[str]]:
    """Compare result lanes against EXPECTED_LANES. Returns (all_ok, issues)."""
    expected = EXPECTED_LANES.get(patient_id, {})
    issues: list[str] = []
    for trial_data in result.get("trials", []):
        nct = trial_data.get("nctId", "")
        got = trial_data.get("lane", "")
        want = expected.get(nct)
        if want is None:
            continue
        if got != want:
            issues.append(f"{nct}: expected={want}, got={got}")
    # check that all expected NCTs are present
    got_ncts = {t.get("nctId") for t in result.get("trials", [])}
    for nct in expected:
        if nct not in got_ncts:
            issues.append(f"{nct}: missing from result")
    return len(issues) == 0, issues


def step7(patient_id: str = "P001") -> int:
    """Run the full Band agent pipeline for a patient and validate the result.

    Defaults to P001 (expected: NCT06207734=match). Pass a different patient id
    as the second CLI arg, e.g.:
        uv run python check_pipeline.py step7 P002
    """
    if not ENV_PATH.exists():
        print(f"[step7] FAIL: .env not found — run step1 first")
        return 1
    load_dotenv(ENV_PATH, override=True)

    print(f"[step7] patient  = {patient_id}")
    print(f"[step7] timeout  = {STEP7_TIMEOUT}s")
    print(f"[step7] expected = {EXPECTED_LANES.get(patient_id, 'unknown')}\n")

    # 1. Drain backlog so the probe message from step5 doesn't accidentally
    #    wake intake and confuse the pipeline.
    print("[step7] draining backlog...", end=" ", flush=True)
    drained = _drain_backlog_silent()
    print(f"{drained} message(s) drained.\n")

    # 2. Kick off the pipeline via run_agents.run().
    print("[step7] posting task to Band room and waiting for analyzer result...")
    print("[step7] (this takes ~1–3 min — watch agent terminals)\n")

    t0 = time.perf_counter()
    try:
        from trialsync.run_agents import run as run_pipeline
        result = run_pipeline(patient_id, timeout_s=STEP7_TIMEOUT)
    except TimeoutError as err:
        elapsed = time.perf_counter() - t0
        print(f"\n[step7] FAIL: timed out after {elapsed:.0f}s — {err}")
        print("[step7] Hint: are all 4 agent processes running?")
        print("         .\\scripts\\start_agents.ps1")
        return 1
    except Exception as err:  # noqa: BLE001
        elapsed = time.perf_counter() - t0
        print(f"\n[step7] FAIL: pipeline error after {elapsed:.0f}s — {err}")
        return 1

    elapsed = time.perf_counter() - t0
    print(f"[step7] result received in {elapsed:.0f}s\n")

    # 3. Print the result in the same format as cli.py.
    print("=" * 72)
    for trial in result.get("trials", []):
        nct  = trial.get("nctId", "?")
        lane = trial.get("lane", "?").upper()
        title = trial.get("title", "")
        expl  = trial.get("explanation", "")
        print(f"\n{nct}  [{lane}]")
        print(f"  {title}")
        if expl:
            print(f"  > {expl}")
        for c in trial.get("criteria", []):
            verdict = c.get("verdict", "?").upper()
            ctype   = (c.get("type") or "")[:4]
            text    = c.get("text", "")
            why     = c.get("rationale", "")
            print(f"    [{verdict}] ({ctype}) {text}")
            if why:
                print(f"      rationale: {why}")
    print("\n" + "-" * 72)
    print("Lane summary:")
    for trial in result.get("trials", []):
        print(f"  {trial.get('nctId', '?')}: {trial.get('lane', '?').upper()}")

    # 4. Validate lanes.
    print()
    ok, issues = _check_lanes(patient_id, result)
    if issues:
        print(f"[step7] FAIL: lane mismatch(es):")
        for issue in issues:
            print(f"  ✗ {issue}")
        return 1

    print(f"[step7] OK: all lanes match expected for {patient_id} "
          f"(elapsed {elapsed:.0f}s).")
    return 0


# ---------------------------------------------------------------------------
# Step 4 — Band room readable as each agent
# ---------------------------------------------------------------------------

BAND_REST_BASE = "https://app.band.ai/api/v1"

# (display name, env var holding that agent's key) — same order as the pipeline.
BAND_AGENT_KEYS: list[tuple[str, str]] = [
    ("intake",     "BAND_AGENT_KEY_INTAKE"),
    ("discoverer", "BAND_AGENT_KEY_DISCOVERER"),
    ("parser",     "BAND_AGENT_KEY_PARSER"),
    ("analyzer",   "BAND_AGENT_KEY_ANALYZER"),
]


def _band_get_messages(agent_key: str, room: str, timeout: int = 30) -> tuple[int, dict[str, Any] | str]:
    url = f"{BAND_REST_BASE}/agent/chats/{room}/messages"
    headers = {"X-API-Key": agent_key}
    resp = requests.get(url, headers=headers, timeout=timeout)
    try:
        return resp.status_code, resp.json()
    except ValueError:
        return resp.status_code, resp.text


def step4() -> int:
    """Read the Band room from each of the 4 agent keys.

    Per SETUP.md note (7), an agent's message list only returns messages that
    @-mention that agent — so each key gives us a different (smaller) view.
    Empty inbox is fine; what we're really checking is auth + room validity.
    """
    if not ENV_PATH.exists():
        print(f"[step4] FAIL: .env not found at {ENV_PATH} — run step1 first")
        return 1
    load_dotenv(ENV_PATH, override=True)
    room = os.environ.get("BAND_ROOM_ID")
    if not room:
        print("[step4] FAIL: BAND_ROOM_ID missing — run step1 first")
        return 1

    print(f"[step4] room = {room[:8]}…\n")
    failed: list[str] = []
    total_visible = 0

    for who, env_key in BAND_AGENT_KEYS:
        key = os.environ.get(env_key)
        if not key:
            print(f"  {who:11s} FAIL — {env_key} missing")
            failed.append(who)
            continue
        t0 = time.perf_counter()
        status, data = _band_get_messages(key, room)
        elapsed = time.perf_counter() - t0
        if status != 200 or not isinstance(data, dict):
            snippet = json.dumps(data)[:160] if isinstance(data, dict) else str(data)[:160]
            print(f"  {who:11s} FAIL — HTTP {status} in {elapsed:.1f}s: {snippet}")
            failed.append(who)
            continue
        msgs = data.get("messages") or data.get("data") or []
        total_visible += len(msgs)
        print(f"  {who:11s} OK   — {len(msgs):3d} msg(s) visible in {elapsed:.1f}s")

    print()
    if failed:
        print(f"[step4] FAIL: {len(failed)} agent(s) could not read: {', '.join(failed)}")
        return 1
    print(f"[step4] OK: all 4 agent keys can read the room ({total_visible} total visible mentions).")
    if total_visible > 0:
        print("[step4] Note: backlog present. Run `uv run python drain_backlog.py` before the live run if you want a clean slate.")
    return 0


STEPS = {
    "step1": step1,
    "step2": step2,
    "step3": step3,
    "step4": step4,
    "step5": step5,
    "step6": step6,
    "step7": step7,
}


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] not in STEPS:
        print(f"usage: python {Path(__file__).name} <{'|'.join(STEPS)}>")
        print(f"       python {Path(__file__).name} step7 [P001|P002|P003]")
        return 2
    fn = STEPS[argv[1]]
    # step7 accepts an optional patient_id arg
    if argv[1] == "step7" and len(argv) >= 3:
        return fn(argv[2])
    return fn()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
