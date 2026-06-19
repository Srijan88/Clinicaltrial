# TrialSync — Milestone 2 Setup (Band multi-agent layer)

Milestone 2 adds a four-agent Band choreography on top of the verified
Milestone 1 data layer. The LLM agents produce **reasoning and rationale only**;
the match/no_match verdict stays deterministic, computed from the curated
structured levers (the same logic as `baseline_matcher.py`). Lanes reproduce
Milestone 1 exactly.

## Prerequisites

- Python 3.11+, [`uv`](https://docs.astral.sh/uv/).
- A populated `.env` at the repo root (already created; **never committed** —
  it is in `.gitignore`).

```bash
uv sync
```

## Environment variables (.env)

The agents and orchestrator read these via `python-dotenv`:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `BAND_API_KEY` | orchestrator | Human/user key (`band_u_…`) for the REST Human API. |
| `BAND_ROOM_ID` | orchestrator | The Band chat room the agents share. |
| `BAND_AGENT_ID_<ROLE>` / `BAND_AGENT_KEY_<ROLE>` | each agent | Per-agent credentials (INTAKE, PARSER, DISCOVERER, ANALYZER). |
| `HANDLE_<ROLE>` | prompts / orchestrator | `@`-handles used for mentions. |
| `FEATHERLESS_BASE_URL` / `FEATHERLESS_API_KEY` | brains.py | Powers intake/parser/discoverer. |
| `AIML_BASE_URL` / `AIML_API_KEY` | brains.py | Powers analyzer. |

Model IDs (non-secret) live in `agent_config.yaml`, not in `.env` or code:
- intake / discoverer / parser → Featherless `meta-llama/Meta-Llama-3.1-8B-Instruct`
- analyzer → AI/ML API `gpt-4o-mini`

## Running

The four agents are long-running processes that connect to the Band room over
WebSocket. **They show OFFLINE in the Band UI until these processes run.**

**Windows (one window per agent — simplest):**
```powershell
.\scripts\start_agents.ps1
```
or manually, four separate terminals:
```powershell
uv run python -m trialsync.agents.intake
uv run python -m trialsync.agents.discoverer
uv run python -m trialsync.agents.parser
uv run python -m trialsync.agents.analyzer
```

**macOS / Linux:**
```bash
./scripts/start_agents.sh
```

Then, in another terminal, run a match through the agents:
```bash
uv run trialsync match-agents P001
uv run trialsync match-agents P002
uv run trialsync match-agents P003
```

The deterministic offline command is unchanged and needs no agents:
```bash
uv run trialsync match P001
```

## Pipeline

```
orchestrator (you, via REST Human API)
   │  posts task, @mentions intake
   ▼
intake (Featherless)      → loads + normalizes patient, posts summary, @mentions discoverer + parser
   ▼
discoverer (Featherless)  → reads curated.json, posts candidate NCT list, @mentions parser
   ▼
parser (Featherless)      → restates each trial's key eligibility constraints, @mentions analyzer
   ▼
analyzer (AI/ML API)      → calls compute_trial_verdicts (DETERMINISTIC), writes rationale,
                            posts final delimited JSON result
   ▼
orchestrator polls the room, parses the result between
===TRIALSYNC_RESULT_BEGIN=== / ===TRIALSYNC_RESULT_END===
```

`match-agents` prints the **deterministic** verdict for every trial/criterion
(recomputed locally as the source of truth) plus the analyzer's LLM rationale.

## SDK / doc differences (Task 0 findings)

Verified against docs.band.ai and confirmed by introspecting the installed
`band-sdk==1.0.0`. Where reality differed from the brief or the older docs, the
code follows the installed SDK:

1. **Import name is `band`, not `thenvoi`.** band-sdk 1.0 exposes the package as
   `band` (`from band import Agent`, `from band.adapters import LangGraphAdapter`).
   The published docs/tutorials still show `from thenvoi import …`.
2. **Send-message tool is `band_send_message`** (the docs example calls it
   `thenvoi_send_message`). Mention/participant tools: `band_get_participants`,
   `band_add_participant`, `band_lookup_peers`.
3. **`band.config.load_agent_config(agent_key)` reads a separate YAML file** and
   returns `(agent_id, api_key)`. Per the project's credential rule (secrets in
   `.env` only), we bypass it and pass `agent_id`/`api_key` from `.env` straight
   into `Agent.create(...)`. `agent_config.yaml` is used only for model IDs.
4. **No public client class for an external orchestrator.** The SDK is
   agent-side; `band_send_message` is bound to an agent's room context. So
   `run_agents.py` drives the room as the human user via the REST Human API:
   - `POST  https://app.band.ai/api/v1/me/chats/{room}/messages`
   - `GET   https://app.band.ai/api/v1/me/chats/{room}/messages?message_type=text`
   - Auth header `X-API-Key: <BAND_API_KEY>`.
5. `Agent.create` defaults `ws_url`/`rest_url` to `app.band.ai`, so we don't set
   them explicitly.
6. **`band_send_message` requires ≥1 mention** and takes `mentions: list[str]`
   of handles (e.g. `["@srijanmeh8/trialsync-analyzer"]`); the SDK resolves them
   to ids. The REST Agent API instead takes `mentions: [{"id": ...}]`.
7. **An agent's REST message list only returns messages that @mention that
   agent** (it does not see its own sent messages). Combined with (4), the
   orchestrator cannot reliably read the analyzer's final post from the room, so
   the analyzer ALSO writes the result locally via the `publish_result` tool to
   `data/cache/agent_results/<pid>.json`, which the CLI reads. The agents still
   converse entirely through Band; only the final hand-back to the CLI is local
   IPC (the agents run on the same machine as the CLI).

## Operational notes (live-run findings)

- **Model choice / concurrency.** intake/discoverer/parser use
  `Qwen/Qwen2.5-72B-Instruct` on Featherless — the 8B model looped
  (`GraphRecursionError`) and could not drive tool-calls + @mention handoffs.
  Featherless `feather_pro_plus` allows **4 concurrency units** and a 72B request
  costs **4 units**, so overlapping agent calls return HTTP 429
  (`concurrency_limit_exceeded`). The pipeline is sequential, so it still
  completes — the Band runtime re-processes any message whose LLM call was
  briefly 429'd. If you see slow runs or want fewer 429s, either upgrade the
  Featherless plan or switch these three agents to a smaller model in
  `agent_config.yaml`. The analyzer uses AI/ML API `gpt-4o-mini` (separate quota).
- A full `match-agents` run takes roughly 1–3 minutes depending on retries.
- The pipeline is a linear chain intake → discoverer → parser → analyzer (each
  @mentions only the next agent) for routing reliability.

### Per-run rooms (the clean fix for transcript pollution)

Each matching run now creates a **fresh Band room** and adds the four agents to
it, instead of reusing one long-lived room. The orchestrator (`run_agents.py`)
does this via the Agent API:

- `POST /api/v1/agent/chats` with `{"chat": {"title": "TrialSync <pid> <ts>"}}`
  creates the room; the **creating agent** (analyzer, our poster key) is
  auto-added as `owner`.
- `POST /api/v1/agent/chats/{room}/participants` with
  `{"participant": {"participant_id": "<agent-id>", "role": "member"}}` adds the
  other three agents (intake, discoverer, parser).
- The kickoff task is posted to that room (mentioning intake).

Already-running agent processes join the new room automatically through their
`agent_rooms` WebSocket subscription (the SDK's `RoomAddedEvent` →
`subscribe_room`), so **no agent restart is needed** between runs.

**Why this matters.** The Band SDK has no message-delete endpoint, so a single
shared room accumulated every prior run's transcript. That polluted the live
tail (old messages bleeding into a new run — you'd see repeated kickoff messages
from earlier searches) and, before hydration was disabled, confused agents into
skipping handoffs as the room grew. A fresh, empty room per run removes the root
cause: each run's tail contains only its own messages, and every agent starts
from a clean slate. Verified — a P002 run's tail returns exactly 5 messages
(kickoff + 4 agents), all referencing P002, zero cross-run noise.

**Known trade-off.** Rooms are not deleted after a run (the Agent API exposes no
delete), so they accumulate in the Band workspace over time. Harmless for the
demo; archive/clean them from the Band UI if the list gets long.

### Context hydration stays disabled (belt-and-suspenders)

`agent_common.py` still creates each agent with
`SessionConfig(enable_context_hydration=False)`. With per-run rooms this is
mostly redundant (a fresh room has no history to hydrate), but it's kept as a
cheap safeguard: it guarantees each agent acts only on its self-contained
triggering message even if a room is ever reused.

### Model sweep (with hydration disabled)

Re-tested the three Featherless agents across model sizes after the hydration
fix. Latency is dominated by the sequential 4-hop chain + the 4-unit concurrency
cap, **not** raw model size, so smaller models help only marginally:

| Model | Reliability (P001/P002/P003) | Avg latency | Verdict |
|-------|------------------------------|-------------|---------|
| Qwen2.5-14B | 1/3 — parser drops its handoff | ~63s | rejected (parser is the heaviest agent: `list_candidate_trials` + `get_trial_criteria`×3 + send) |
| Qwen2.5-32B | 3/3 | ~96s | reliable, lower unit cost — valid alternative |
| Qwen2.5-72B | 3/3 | ~103s | **current config** — most-tested, chosen for demo reliability |

To switch models, edit `agent_config.yaml` and restart the agent processes.

## Notes

- No live ClinicalTrials.gov call happens at match time — trials load from
  `data/trials/curated.json`.
- Determinism guarantee: even if an LLM phrases things loosely, the lane and
  per-criterion verdict shown come from `baseline_matcher`, never from the model.
