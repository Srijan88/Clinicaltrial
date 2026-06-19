"""Orchestrator for the Band agent choreography.

Kicks off the pipeline by posting a task to the Band room (@mentioning intake)
via the REST **Agent API**, then waits for the analyzer's final result.

Two Band limitations shape this design (see SETUP.md):
  * The Human `/me/...` API is gated behind an Enterprise plan, so the CLI cannot
    read the room as the user.
  * An agent's message list only returns messages that @mention that agent.

So the final hand-back to the CLI uses a local result file the analyzer writes
(`publish_result` tool) — the agents run locally on the same machine. The full
intake -> discoverer -> parser -> analyzer conversation still flows through Band;
only the last hop to the CLI is local IPC. The analyzer ALSO posts the delimited
JSON to the room (mentioning the owner) for the human-visible audit trail.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT / ".env"
RESULTS_DIR = ROOT / "data" / "cache" / "agent_results"

REST_BASE = "https://app.band.ai/api/v1"

POLL_INTERVAL_S = 2.0
DEFAULT_TIMEOUT_S = 180

# Agent key used to author the kickoff message (the Human API is Enterprise-gated,
# so we post as an existing agent). Must NOT be the intake agent, so intake sees
# and processes the mention.
POSTER_KEY_ENV = "BAND_AGENT_KEY_ANALYZER"

RESULT_BEGIN = "===TRIALSYNC_RESULT_BEGIN==="
RESULT_END   = "===TRIALSYNC_RESULT_END==="


def _env() -> dict:
    load_dotenv(ENV_PATH)
    required = [POSTER_KEY_ENV, "BAND_ROOM_ID", "BAND_AGENT_ID_INTAKE", "HANDLE_INTAKE"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        raise RuntimeError(f"Missing env vars: {', '.join(missing)} (is .env present?)")
    return {k: os.environ[k] for k in required}


def _agent_headers(env: dict) -> dict:
    return {"X-API-Key": env[POSTER_KEY_ENV], "Content-Type": "application/json"}


def create_run_room(env: dict, patient_id: str) -> str:
    """Create a FRESH Band room for this run and add the four agents to it.

    Why per-run rooms: the Band SDK has no message-delete endpoint, so a single
    long-lived room accumulates every prior run's transcript. That polluted the
    live tail (old messages bleeding into new runs) and, before we disabled
    context hydration, confused the agents into skipping their handoffs. A fresh,
    empty room per run removes the root cause: each run's tail shows only its own
    messages and every agent acts on a clean slate.

    Mechanics (verified against the Agent API):
      * POST /agent/chats {"chat": {"title": ...}} -> 201; the CREATING agent
        (analyzer, our poster key) is auto-added as owner.
      * POST /agent/chats/{room}/participants
        {"participant": {"participant_id": <id>, "role": "member"}} adds each of
        the other three agents.
    Already-running agent processes join automatically via their `agent_rooms`
    WebSocket subscription (RoomAddedEvent), so no restart is needed.
    """
    headers = _agent_headers(env)
    title = f"TrialSync {patient_id} {int(time.time())}"
    resp = requests.post(f"{REST_BASE}/agent/chats", headers=headers,
                         json={"chat": {"title": title}}, timeout=30)
    resp.raise_for_status()
    room = (resp.json().get("data") or {}).get("id")
    if not room:
        raise RuntimeError(f"room creation returned no id: {resp.text[:200]}")

    # Add the three non-creator agents (analyzer is already owner).
    for role in ("INTAKE", "DISCOVERER", "PARSER"):
        agent_id = os.environ.get(f"BAND_AGENT_ID_{role}")
        if not agent_id:
            continue
        body = {"participant": {"participant_id": agent_id, "role": "member"}}
        r = requests.post(f"{REST_BASE}/agent/chats/{room}/participants",
                          headers=headers, json=body, timeout=30)
        # 409/200/201 are all fine (already a member / added). Anything else is fatal.
        if r.status_code not in (200, 201, 409):
            raise RuntimeError(
                f"failed to add {role} to room {room}: HTTP {r.status_code} {r.text[:160]}")
    return room


def leave_run_room(env: dict, room: str) -> None:
    """Best-effort: remove all four agents from a finished run's room so the
    long-running agent processes stop polling it. Per-run rooms otherwise
    accumulate and each agent round-robins /messages/next across ALL of them,
    adding latency and 429 pressure. Never raises."""
    if not room:
        return
    headers = {"X-API-Key": env.get(POSTER_KEY_ENV, "")}
    for role in ("INTAKE", "DISCOVERER", "PARSER", "ANALYZER"):
        aid = os.environ.get(f"BAND_AGENT_ID_{role}")
        if not aid:
            continue
        try:
            requests.delete(f"{REST_BASE}/agent/chats/{room}/participants/{aid}",
                            headers=headers, timeout=20)
        except requests.RequestException:
            pass


def post_task(env: dict, patient_id: str, room: str | None = None) -> None:
    room = room or env["BAND_ROOM_ID"]
    handle = env["HANDLE_INTAKE"]
    content = (
        f"{handle} New ClinicalTrials matching task. Match patient {patient_id} "
        f"against all curated trials. Summarize the patient, then hand off down "
        f"the pipeline; the analyzer posts and publishes the final result."
    )
    # REST Agent API expects mentions as objects with the agent id.
    body = {
        "message": {
            "content": content,
            "mentions": [{"id": env["BAND_AGENT_ID_INTAKE"], "handle": handle.lstrip("@")}],
        }
    }
    url = f"{REST_BASE}/agent/chats/{room}/messages"
    headers = {"X-API-Key": env[POSTER_KEY_ENV], "Content-Type": "application/json"}
    resp = requests.post(url, headers=headers, json=body, timeout=30)
    resp.raise_for_status()


def _scrape_result_from_room(patient_id: str, start_ts: float,
                             room: str | None = None) -> dict | None:
    """Fallback: scan the analyzer's processed messages for the delimited JSON block.

    The analyzer always posts the result to the room even when it skips
    publish_result. We use the analyzer's own key to read its processed inbox
    (messages mentioning the analyzer), find the most recent one containing the
    delimiters that was sent after start_ts, and parse the JSON from it.
    Returns the parsed result dict, or None if not found.
    """
    load_dotenv(ENV_PATH)
    key  = os.environ.get("BAND_AGENT_KEY_ANALYZER", "")
    room = room or os.environ.get("BAND_ROOM_ID", "")
    if not key or not room:
        return None
    try:
        url  = f"{REST_BASE}/agent/chats/{room}/messages?status=processed"
        resp = requests.get(url, headers={"X-API-Key": key}, timeout=30)
        if resp.status_code != 200:
            return None
        msgs = resp.json().get("data") or resp.json().get("messages") or []
        # Walk newest-first (Band returns newest last, so reverse).
        for msg in reversed(msgs):
            content = msg.get("content") or ""
            # Only consider messages that contain the result for this patient.
            if patient_id not in content:
                continue
            if RESULT_BEGIN not in content or RESULT_END not in content:
                continue
            between = content.split(RESULT_BEGIN, 1)[1].split(RESULT_END, 1)[0].strip()
            try:
                data = json.loads(between)
                if data.get("patientId") == patient_id:
                    # Write to the result file so future calls (and the CLI) can
                    # use the normal path.
                    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
                    path = RESULTS_DIR / f"{patient_id}.json"
                    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
                    return data
            except json.JSONDecodeError:
                continue
    except Exception:  # noqa: BLE001 — fallback must never crash the caller
        pass
    return None


def wait_for_result(patient_id: str, start_ts: float,
                    timeout_s: int = DEFAULT_TIMEOUT_S,
                    room: str | None = None) -> dict:
    path = RESULTS_DIR / f"{patient_id}.json"
    deadline = start_ts + timeout_s
    while time.time() < deadline:
        if path.exists() and path.stat().st_mtime >= start_ts:
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if data.get("patientId", patient_id) == patient_id:
                    return data
            except json.JSONDecodeError:
                pass  # analyzer may still be writing; retry
        time.sleep(POLL_INTERVAL_S)
    # Primary path timed out. Try scraping the result from the Band room — the
    # analyzer always posts the delimited JSON there even if it skips publish_result.
    print(f"[run_agents] file poll timed out, attempting room scrape fallback...",
          flush=True)
    scraped = _scrape_result_from_room(patient_id, start_ts, room=room)
    if scraped:
        print(f"[run_agents] recovered result from room message (publish_result was skipped).",
              flush=True)
        return scraped
    raise TimeoutError(
        f"No analyzer result for {patient_id} within {timeout_s}s. Are all four "
        f"agent processes running and connected to Band? Check their logs."
    )


def run(patient_id: str, timeout_s: int = DEFAULT_TIMEOUT_S) -> dict:
    """Kick off the choreography for a patient in a FRESH room and return the
    analyzer's result dict. A new room per run keeps each transcript clean."""
    env = _env()
    # Clear any stale result so we only accept a fresh one from this run.
    stale = RESULTS_DIR / f"{patient_id}.json"
    if stale.exists():
        stale.unlink()
    start_ts = time.time()
    room = create_run_room(env, patient_id)
    print(f"[run_agents] created fresh room {room} for {patient_id}", flush=True)
    post_task(env, patient_id, room=room)
    # We keep all four agents in the finished room (a complete audit trail); the
    # fresh-room-per-run already isolates each run's transcript.
    return wait_for_result(patient_id, start_ts, timeout_s, room=room)


if __name__ == "__main__":
    import sys
    pid = sys.argv[1] if len(sys.argv) > 1 else "P001"
    print(json.dumps(run(pid), indent=2))
