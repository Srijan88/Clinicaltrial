"""FastAPI backend for TrialSync — Milestone 3 web demo surface.

Wraps the existing Milestone 2 Band agent pipeline (run_agents.py) behind a small
REST API the React frontend consumes. The match/no_match verdict stays
DETERMINISTIC (computed from curated levers by baseline_matcher, exactly like the
CLI); the Band agents only contribute LLM rationale. The API returns the same
lanes as `uv run trialsync match-agents` for P001/P002/P003.

Design notes
------------
* POST /api/v1/trials/find starts the pipeline in a BACKGROUND thread and returns
  run metadata ({run_id, room_id, started_at}) immediately, so the frontend can
  begin tailing the room while the agents work. The final structured result is
  delivered via GET /run/{run_id}/status once state == "done". (Blocking the HTTP
  request for 1-3 min would make a live tail impossible.)
* The Band Agent API only returns messages that @mention the querying agent, so a
  single agent key cannot see the whole transcript. We merge the message lists of
  all four agent keys (each sees the handoff addressed to it) plus the analyzer's
  /context (which includes the final result it sent) to reconstruct the full room
  conversation for the live tail. The agent key NEVER reaches the browser — the
  frontend only talks to this backend, which proxies the Band calls.
* Run state lives in an in-memory dict (fine for the hackathon).
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import run_agents
from .baseline_matcher import load_patient, load_trials, match_patient

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RAW_TRIALS_DIR = DATA / "trials" / "raw"
ENV_PATH = ROOT / ".env"
RUNS_CACHE_DIR = DATA / "cache" / "runs"
REST_BASE = "https://app.band.ai/api/v1"

DEFAULT_TIMEOUT_S = 300
DEMO_MSG_INTERVAL_S = 0.6

AGENT_ROLES = ["intake", "discoverer", "parser", "analyzer"]

load_dotenv(ENV_PATH)

# In-memory run registry: run_id -> run state dict.
RUNS: dict[str, dict] = {}
_RUNS_LOCK = threading.Lock()


# ---------------------------------------------------------------------------
# Identity maps (from .env) — used to label room messages by author role.
# ---------------------------------------------------------------------------

def _agent_id_to_role() -> dict[str, str]:
    out: dict[str, str] = {}
    for role in AGENT_ROLES:
        aid = os.environ.get(f"BAND_AGENT_ID_{role.upper()}")
        if aid:
            out[aid] = role
    return out


def _role_to_handle(role: str) -> str:
    return os.environ.get(f"HANDLE_{role.upper()}", f"@{role}")


# ---------------------------------------------------------------------------
# Result merge: deterministic verdicts (source of truth) + LLM rationale.
# ---------------------------------------------------------------------------

def _index_agent_rationale(agent_result: dict) -> dict:
    """Map (nctId, criterion index) -> rationale and nctId -> explanation."""
    crit: dict[tuple[str, int], str] = {}
    trial_expl: dict[str, str] = {}
    for tr in agent_result.get("trials", []):
        nct = tr.get("nctId", "")
        trial_expl[nct] = tr.get("explanation", "")
        for c in tr.get("criteria", []):
            idx = c.get("index")
            if isinstance(idx, int):
                crit[(nct, idx)] = c.get("rationale", "")
    return {"criteria": crit, "trials": trial_expl}


def build_result(patient_id: str, agent_result: dict) -> dict:
    """Combine the DETERMINISTIC verdicts with the agent's LLM rationale into the
    structured payload the frontend renders. The lane/verdict come from
    baseline_matcher; only `explanation`/`rationale` come from the agents."""
    patient = load_patient(patient_id)
    results = match_patient(patient)
    rationale = _index_agent_rationale(agent_result or {})

    trials_out = []
    for tr in results:
        nct = tr.trial.nctId
        crits = []
        for i, r in enumerate(tr.results):
            crits.append({
                "index": i,
                "text": r.criterion.text,
                "type": r.criterion.type,
                "lever": r.criterion.lever,
                "verdict": r.verdict,  # deterministic
                "detail": r.detail,
                "rationale": rationale["criteria"].get((nct, i), ""),
            })
        trials_out.append({
            "nctId": nct,
            "title": tr.trial.title,
            "phase": tr.trial.phase,
            "conditions": tr.trial.conditions,
            "detailsUrl": tr.trial.detailsUrl or f"https://clinicaltrials.gov/study/{nct}",
            "lane": tr.lane,  # deterministic
            "explanation": rationale["trials"].get(nct, ""),
            "criteria": crits,
            **_load_trial_details(nct),  # locations + contacts from raw JSON
        })

    return {
        "patientId": patient.patientId,
        "subtype": patient.subtype,
        "hr_status": patient.hr_status,
        "her2_status": patient.her2_status,
        "ecog": patient.ecog,
        "trials": trials_out,
    }


def _load_trial_details(nct_id: str) -> dict:
    """Extract location and contact info from the raw ClinicalTrials.gov JSON.
    Returns a dict with 'locations' and 'contacts'. Gracefully returns empty
    lists if the file is missing or malformed — the rest of the pipeline is
    unaffected."""
    raw_path = RAW_TRIALS_DIR / f"{nct_id}.json"
    if not raw_path.exists():
        return {"locations": [], "contacts": []}
    try:
        raw = json.loads(raw_path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {"locations": [], "contacts": []}

    cl = (raw.get("protocolSection") or {}).get("contactsLocationsModule") or {}

    # Locations — dedupe by (city, country), keep only RECRUITING ones first,
    # then fall back to all. Limit to 8 so the card doesn't overflow.
    raw_locs = cl.get("locations") or []
    recruiting = [l for l in raw_locs if l.get("status") == "RECRUITING"]
    locs_to_use = recruiting or raw_locs
    seen: set[tuple] = set()
    locations = []
    for loc in locs_to_use:
        city = loc.get("city") or ""
        state = loc.get("state") or ""
        country = loc.get("country") or ""
        facility = loc.get("facility") or ""
        key = (city.lower(), country.lower())
        if key in seen or not city:
            continue
        seen.add(key)
        parts = [p for p in [city, state, country] if p]
        locations.append({
            "facility": facility,
            "city": city,
            "state": state,
            "country": country,
            "display": ", ".join(parts),
            "status": loc.get("status") or "",
        })
        if len(locations) >= 8:
            break

    # Contacts — central contacts preferred, first 2
    raw_contacts = cl.get("centralContacts") or []
    contacts = []
    for c in raw_contacts[:2]:
        name = c.get("name") or ""
        phone = c.get("phone") or ""
        email = c.get("email") or ""
        if name:
            contacts.append({"name": name, "phone": phone, "email": email})

    return {"locations": locations, "contacts": contacts}


def patient_headline(patient_id: str) -> dict:
    """Compact patient traits for the picker and header strip. Includes full
    profile fields (labs, prior therapies, flags, location) so the patient card
    can show a full clinical snapshot."""
    p = load_patient(patient_id)
    return {
        "patientId": p.patientId,
        "age": p.age,
        "sex": p.sex,
        "diagnosis": p.diagnosis,
        "stage": p.stage,
        "subtype": p.subtype,
        "ecog": p.ecog,
        "hr_status": p.hr_status,
        "er_status": p.er_status,
        "pr_status": p.pr_status,
        "her2_status": p.her2_status,
        "ar_status": p.ar_status,
        "labs": p.labs.model_dump(),
        "priorTherapies": [pt.model_dump() for pt in p.priorTherapies],
        "on_cdk46_inhibitor": p.on_cdk46_inhibitor,
        "durable_disease_control": p.durable_disease_control,
        "brainMets": p.brainMets,
        "location": p.location,
    }


# ---------------------------------------------------------------------------
# Band room reading — merge all four agent keys to reconstruct full transcript.
# ---------------------------------------------------------------------------

def _parse_ts(raw: Optional[str]) -> float:
    """Parse a Band ISO timestamp to epoch seconds; 0.0 if unparseable."""
    if not raw:
        return 0.0
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
    except (ValueError, AttributeError):
        return 0.0


def _normalize_message(raw: dict, id_to_role: dict[str, str]) -> dict:
    """Convert a raw Band message into the clean shape the frontend expects."""
    sender_id = raw.get("sender_id") or raw.get("senderId") or ""
    content = raw.get("content") or ""
    # Replace raw @[[<agent-id>]] mention tokens with readable @handles.
    for aid, role in id_to_role.items():
        content = content.replace(f"@[[{aid}]]", _role_to_handle(role))
    # Strip any remaining @[[<uuid>]] tokens (e.g. the human owner's id) — they
    # are noise in the tail. Replace with a generic @owner mention.
    content = re.sub(r"@\[\[[0-9a-fA-F-]{36}\]\]", "@owner", content)
    posted_raw = (
        raw.get("inserted_at") or raw.get("created_at")
        or raw.get("insertedAt") or raw.get("posted_at")
    )

    role = id_to_role.get(sender_id, "")
    # The kickoff task is posted with the analyzer's key (POSTER_KEY_ENV) but is
    # really the orchestrator's message — relabel it so the tail isn't confused.
    if "New ClinicalTrials matching task" in content:
        role = "orchestrator"
        handle = "orchestrator"
    elif role:
        handle = _role_to_handle(role).lstrip("@")
    else:
        handle = raw.get("sender_name") or "participant"

    # Tool calls may appear in metadata; surface them as a compact list if present.
    tool_calls = None
    meta = raw.get("metadata") or {}
    if isinstance(meta, dict):
        tc = meta.get("tool_calls") or meta.get("toolCalls")
        if tc:
            tool_calls = tc

    return {
        "id": raw.get("id", ""),
        "author_handle": handle,
        "author_role": role or "participant",
        "text": content,
        "posted_at": posted_raw or "",
        "_ts": _parse_ts(posted_raw),
        **({"tool_calls": tool_calls} if tool_calls else {}),
    }


def _fetch_room_transcript(room: str, since_ts: float = 0.0) -> list[dict]:
    """Reconstruct the full transcript of `room` by merging the message lists of
    all four agent keys (each sees the handoff addressed to it) plus the
    analyzer's /context (which includes the final result it sent). Deduped by
    message id, sorted by timestamp, filtered to messages at/after since_ts."""
    if not room:
        return []
    id_to_role = _agent_id_to_role()
    seen: dict[str, dict] = {}

    def _ingest(url: str, key: str) -> None:
        try:
            r = requests.get(url, headers={"X-API-Key": key}, timeout=20)
            if r.status_code != 200:
                return
            payload = r.json()
            msgs = payload.get("data") or payload.get("messages") or []
            for m in msgs:
                mid = m.get("id")
                if mid and mid not in seen:
                    seen[mid] = m
        except requests.RequestException:
            return

    for role in AGENT_ROLES:
        key = os.environ.get(f"BAND_AGENT_KEY_{role.upper()}")
        if not key:
            continue
        _ingest(f"{REST_BASE}/agent/chats/{room}/messages?status=all", key)

    # Analyzer's /context surfaces the final result message it authored.
    analyzer_key = os.environ.get("BAND_AGENT_KEY_ANALYZER")
    if analyzer_key:
        _ingest(f"{REST_BASE}/agent/chats/{room}/context", analyzer_key)

    out = [_normalize_message(m, id_to_role) for m in seen.values()]
    out = [m for m in out if m["_ts"] >= since_ts - 0.001]
    out.sort(key=lambda m: (m["_ts"], m["id"]))
    return out


# Stage derivation: which agent is *working* given the latest message author.
# "derive stages from the most recent message author in the Band room."
_NEXT_STAGE_AFTER = {
    "orchestrator": "intake",
    "intake": "discoverer",
    "discoverer": "parser",
    "parser": "analyzer",
    "analyzer": "done",
}


def _derive_stage(transcript: list[dict]) -> str:
    if not transcript:
        return "starting"
    last_role = transcript[-1]["author_role"]
    return _NEXT_STAGE_AFTER.get(last_role, "intake")


def _drain_room() -> int:
    """Mark any unprocessed messages processed for all four agents, so a fresh
    run starts from a clean queue. Returns the number drained. Best-effort."""
    room = os.environ.get("BAND_ROOM_ID", "")
    drained = 0
    for role in AGENT_ROLES:
        key = os.environ.get(f"BAND_AGENT_KEY_{role.upper()}")
        if not key:
            continue
        h = {"X-API-Key": key}
        while True:
            try:
                r = requests.get(f"{REST_BASE}/agent/chats/{room}/messages/next",
                                 headers=h, timeout=20)
            except requests.RequestException:
                break
            if r.status_code != 200:
                break
            body = r.json()
            msg = body.get("data") or body
            mid = msg.get("id") if isinstance(msg, dict) else None
            if not mid:
                break
            try:
                requests.post(f"{REST_BASE}/agent/chats/{room}/messages/{mid}/processing",
                              headers=h, timeout=20)
                requests.post(f"{REST_BASE}/agent/chats/{room}/messages/{mid}/processed",
                              headers=h, timeout=20)
            except requests.RequestException:
                break
            drained += 1
    return drained


# ---------------------------------------------------------------------------
# Run orchestration.
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _set_run(run_id: str, **updates) -> None:
    with _RUNS_LOCK:
        RUNS[run_id].update(updates)


def _snapshot_run(patient_id: str, result: dict, transcript: list[dict]) -> None:
    """Persist result + full transcript to data/cache/runs/{patientId}.json so
    demo mode can replay it later (safety net for Featherless 429s)."""
    RUNS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    clean = [
        {k: v for k, v in m.items() if k != "_ts"}
        for m in transcript
    ]
    path = RUNS_CACHE_DIR / f"{patient_id}.json"
    path.write_text(
        json.dumps({"result": result, "transcript": clean}, indent=2),
        encoding="utf-8",
    )


def _live_run_worker(run_id: str, patient_id: str, timeout_s: int) -> None:
    """Background worker: drive the real Band pipeline in a FRESH per-run room,
    then snapshot the run. A new room per run keeps the live tail clean (only
    this run's messages) and gives every agent an empty-history starting point —
    the root-cause fix for the cross-run pollution we previously masked with
    backlog draining and disabled hydration. The agents are detached from the
    room once the run finishes so they don't keep polling dead rooms."""
    env = run_agents._env()
    room = ""
    try:
        # Clear any stale result so we only accept this run's fresh output.
        stale = run_agents.RESULTS_DIR / f"{patient_id}.json"
        if stale.exists():
            stale.unlink()
        start_ts = time.time()
        # Create a dedicated room and add the four agents. Already-running agents
        # join automatically via their agent_rooms WebSocket subscription.
        room = run_agents.create_run_room(env, patient_id)
        _set_run(run_id, started_ts=start_ts, started_at=_now_iso(),
                 room_id=room, state="intake")
        run_agents.post_task(env, patient_id, room=room)

        agent_result = run_agents.wait_for_result(patient_id, start_ts, timeout_s, room=room)
        result = build_result(patient_id, agent_result)
        transcript = _fetch_room_transcript(room, since_ts=start_ts)
        _set_run(run_id, state="done", result=result, finished_at=_now_iso())
        _snapshot_run(patient_id, result, transcript)
        # NOTE: we intentionally do NOT remove agents from the room afterwards.
        # The fresh-room-per-run already isolates each run's transcript; removing
        # participants only made finished rooms look empty (just the analyzer
        # owner remained) and risked pulling an agent out mid-turn. The leftover
        # rooms are polled cheaply (204s) and serve as a complete audit trail.
    except Exception as err:  # noqa: BLE001 — surface any failure to the client
        _set_run(run_id, state="error", error=str(err), finished_at=_now_iso())


def _demo_run_worker(run_id: str, patient_id: str) -> None:
    """Background worker: replay a cached run, revealing one message every
    ~600ms so the live tail animates without hitting real agents."""
    try:
        cache_path = RUNS_CACHE_DIR / f"{patient_id}.json"
        if not cache_path.exists():
            _set_run(run_id, state="error",
                     error=f"No cached run for {patient_id}. Run live mode once "
                           f"to seed data/cache/runs/{patient_id}.json.")
            return
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        transcript = cached.get("transcript", [])
        result = cached.get("result")

        # Back-fill locations/contacts for cached runs that predate this feature.
        if result:
            for t in result.get("trials", []):
                if not t.get("locations"):
                    details = _load_trial_details(t.get("nctId", ""))
                    t.setdefault("locations", details["locations"])
                    t.setdefault("contacts", details["contacts"])

        _set_run(run_id, started_ts=time.time(), started_at=_now_iso(),
                 room_id=os.environ.get("BAND_ROOM_ID", "demo-room"),
                 state="starting", revealed=[])

        for i, msg in enumerate(transcript):
            time.sleep(DEMO_MSG_INTERVAL_S)
            with _RUNS_LOCK:
                RUNS[run_id]["revealed"].append(msg)
                RUNS[run_id]["state"] = _derive_stage(RUNS[run_id]["revealed"])
        # Reveal complete -> deliver the cached result.
        _set_run(run_id, state="done", result=result, finished_at=_now_iso())
    except Exception as err:  # noqa: BLE001
        _set_run(run_id, state="error", error=str(err), finished_at=_now_iso())


def _start_run(patient_id: str, clinician_id: str, mode: str) -> dict:
    if patient_id not in ("P001", "P002", "P003"):
        # Still allow any id the data layer knows; validate it loads.
        try:
            load_patient(patient_id)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))

    run_id = str(uuid.uuid4())
    with _RUNS_LOCK:
        RUNS[run_id] = {
            "run_id": run_id,
            "patient_id": patient_id,
            "clinician_id": clinician_id,
            "mode": mode,
            # Live mode creates a fresh room in the worker; until then there's no
            # room to tail (keeps stale rooms out of the tail). Demo sets its own.
            "room_id": "",
            "started_ts": time.time(),
            "started_at": _now_iso(),
            "state": "starting",
            "result": None,
            "error": None,
            "revealed": [],
        }

    if mode == "demo":
        worker = threading.Thread(target=_demo_run_worker, args=(run_id, patient_id), daemon=True)
    else:
        worker = threading.Thread(
            target=_live_run_worker, args=(run_id, patient_id, DEFAULT_TIMEOUT_S), daemon=True)
    worker.start()

    with _RUNS_LOCK:
        snap = RUNS[run_id]
        return {"run_id": run_id, "room_id": snap["room_id"], "started_at": snap["started_at"]}


# ---------------------------------------------------------------------------
# FastAPI app + endpoints.
# ---------------------------------------------------------------------------

app = FastAPI(title="ClinicalTrials API", version="0.3.0")

# Allowed CORS origins come from the ALLOWED_ORIGINS env var (comma-separated)
# so the deployed frontend domain can be whitelisted without a code change.
# Defaults to the local Vite dev server for development.
_DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", _DEFAULT_ORIGINS).split(",")
    if o.strip()
]

# Vercel serves the frontend on several hostnames (production alias + per-deploy
# + git-branch preview URLs), so match every *.vercel.app origin via regex
# rather than listing each one. Override with ALLOWED_ORIGIN_REGEX if needed.
ALLOWED_ORIGIN_REGEX = os.environ.get(
    "ALLOWED_ORIGIN_REGEX", r"https://.*\.vercel\.app"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class FindRequest(BaseModel):
    patientId: str
    clinicianId: str = ""


def _require_run(run_id: str) -> dict:
    with _RUNS_LOCK:
        run = RUNS.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"unknown run_id {run_id!r}")
    return run


@app.get("/api/v1/patients")
def list_patients() -> list[dict]:
    """Patients from data/patients/ with headline traits for the picker."""
    out = []
    for path in sorted((DATA / "patients").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        pid = data.get("patientId")
        if pid:
            out.append(patient_headline(pid))
    return out


@app.get("/api/v1/clinicians")
def list_clinicians() -> list[dict]:
    """Mock clinician identities (display only; no auth)."""
    path = DATA / "clinicians" / "clinicians.json"
    return json.loads(path.read_text(encoding="utf-8"))


@app.post("/api/v1/trials/find")
def trials_find(req: FindRequest, mode: str = Query("live")) -> dict:
    """Kick off a matching run (live agents or cached demo replay). Returns run
    metadata immediately; the final result is delivered via /run/{id}/status."""
    mode = "demo" if mode == "demo" else "live"
    return _start_run(req.patientId, req.clinicianId, mode)


@app.get("/api/v1/run/{run_id}/status")
def run_status(run_id: str) -> dict:
    """Progress of an in-flight run. State reflects explicit done/error from the
    worker, otherwise it's derived from the most recent room message author.
    Includes the final `result` once state == 'done'."""
    run = _require_run(run_id)
    state = run["state"]

    if state not in ("done", "error", "starting"):
        # Live mode: refine the stage from the live room if we can.
        if run["mode"] == "live":
            try:
                transcript = _fetch_room_transcript(run.get("room_id", ""), since_ts=run["started_ts"])
                derived = _derive_stage(transcript)
                # Don't regress past a terminal state set by the worker.
                state = derived if derived != "done" else "analyzer"
            except Exception:  # noqa: BLE001
                pass

    return {
        "run_id": run_id,
        "state": run["state"] if run["state"] in ("done", "error") else state,
        "patientId": run["patient_id"],
        "clinicianId": run["clinician_id"],
        "mode": run["mode"],
        "started_at": run["started_at"],
        "error": run.get("error"),
        "result": run.get("result"),
    }


@app.get("/api/v1/run/{run_id}/messages")
def run_messages(run_id: str, since: str = Query("")) -> dict:
    """Room messages newer than `since` (a message id), for the live tail.

    Live mode: proxies the Band Agent API (merged across the four agent keys) so
    the agent key never reaches the browser. Demo mode: returns the revealed
    slice of the cached transcript."""
    run = _require_run(run_id)

    if run["mode"] == "demo":
        with _RUNS_LOCK:
            msgs = list(run.get("revealed", []))
    else:
        msgs = _fetch_room_transcript(run.get("room_id", ""), since_ts=run["started_ts"])
        msgs = [{k: v for k, v in m.items() if k != "_ts"} for m in msgs]

    # Return only messages after `since` (by position in the ordered list).
    if since:
        ids = [m["id"] for m in msgs]
        if since in ids:
            msgs = msgs[ids.index(since) + 1:]

    return {"run_id": run_id, "messages": msgs}


@app.get("/api/v1/health")
def health() -> dict:
    return {"status": "ok"}


def serve(host: str = "0.0.0.0", port: int = 8000) -> None:
    """Entry point for `uv run trialsync serve`."""
    import uvicorn
    uvicorn.run("trialsync.api:app", host=host, port=port, log_level="info")
