"""Shared bootstrap for the four TrialSync Band agents.

Each agent is its own process. It loads credentials from .env, builds a
LangGraphAdapter around its provider brain + system prompt + deterministic
tools, and connects to the Band room via `Agent.run()` (blocks forever).

SDK note (see SETUP.md): band-sdk 1.0 imports as `band` (the docs still say
`thenvoi`). We pass agent_id/api_key directly to `Agent.create` from .env rather
than using `band.config.load_agent_config`, which expects a separate YAML file.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
PROMPTS_DIR = ROOT / "prompts"
ENV_PATH = ROOT / ".env"


def load_prompt(agent_name: str) -> str:
    return (PROMPTS_DIR / f"{agent_name}.md").read_text(encoding="utf-8")


async def _run(agent_name: str, id_env: str, key_env: str, tools: list) -> None:
    # Import band lazily so the rest of the package (baseline matcher, CLI) does
    # not require the SDK to be importable.
    from band import Agent
    from band.adapters import LangGraphAdapter
    from band.runtime.types import SessionConfig
    from langgraph.checkpoint.memory import InMemorySaver

    from .brains import make_llm

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    load_dotenv(ENV_PATH)

    agent_id = os.environ.get(id_env)
    api_key = os.environ.get(key_env)
    if not agent_id or not api_key:
        raise RuntimeError(f"Missing {id_env}/{key_env} in .env")

    # The analyzer has more steps than the other agents:
    #   compute_trial_verdicts -> build JSON -> band_send_message -> publish_result
    # Give it a higher recursion limit so it can complete all steps reliably.
    recursion_limit = 50 if agent_name == "analyzer" else 25

    adapter = LangGraphAdapter(
        llm=make_llm(agent_name),
        checkpointer=InMemorySaver(),
        custom_section=load_prompt(agent_name),
        additional_tools=tools,
        recursion_limit=recursion_limit,
    )

    # CRITICAL: disable context hydration. By default each agent loads the ENTIRE
    # room history on bootstrap and feeds it to the LLM. Across repeated runs the
    # room fills with prior "Patient P001 intake:" summaries, candidate lists, and
    # partial results — and the model, seeing the work apparently already done in
    # history, skips its own tool calls / handoff (observed: intake/parser dropping
    # band_send_message as the room grew from 12 -> 18 messages). Each agent's
    # triggering message is self-contained (the kickoff task and every handoff
    # message restate "Patient <id> ..."), so no history is needed to act.
    session_config = SessionConfig(enable_context_hydration=False)

    agent = Agent.create(
        adapter=adapter,
        agent_id=agent_id,
        api_key=api_key,
        session_config=session_config,
    )

    print(f"[{agent_name}] connected to Band as {agent_id}. Waiting for mentions "
          f"(Ctrl+C to stop)...", flush=True)
    await agent.run()


def run_agent(agent_name: str, id_env: str, key_env: str, tools: list) -> None:
    """Entry point used by each agent module's __main__.

    Wraps the agent in a SUPERVISOR LOOP that reconnects automatically. The Band
    SDK disables its own reconnect on a normal WebSocket close (close code 1000 —
    observed after a server-side `phx_error` or an idle drop), so `agent.run()`
    simply returns and the process would otherwise become a zombie: the shell
    stays alive but the agent is no longer listening, and the next kickoff times
    out. This loop detects that return (or any crash) and re-establishes the
    connection with capped exponential backoff, so the agents survive transient
    Band socket drops without manual restarts.
    """
    backoff = 2.0
    backoff_max = 30.0
    while True:
        started = time.time()
        try:
            asyncio.run(_run(agent_name, id_env, key_env, tools))
            # agent.run() returned — the socket dropped (SDK won't self-reconnect).
            reason = "disconnected"
        except KeyboardInterrupt:
            print(f"\n[{agent_name}] shutting down.", flush=True)
            return
        except Exception as err:  # noqa: BLE001 — never let the supervisor die
            reason = f"crashed: {err}"

        # A connection that lasted a while was healthy; reset the backoff so a
        # one-off drop reconnects fast. Repeated rapid failures back off.
        if time.time() - started > 60:
            backoff = 2.0
        print(f"[{agent_name}] {reason}. Reconnecting in {backoff:.0f}s…", flush=True)
        try:
            time.sleep(backoff)
        except KeyboardInterrupt:
            print(f"\n[{agent_name}] shutting down.", flush=True)
            return
        backoff = min(backoff * 2, backoff_max)
