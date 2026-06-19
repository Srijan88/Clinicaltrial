"""Provider wiring for the Band agents.

Both Featherless and the AI/ML API are OpenAI-compatible, so each agent's
"brain" is a `ChatOpenAI` pointed at the right base_url + api_key. The model IDs
are read from agent_config.yaml (non-secret); the base URLs and API keys come
from environment variables loaded from .env (secret).
"""

from __future__ import annotations

import os
from pathlib import Path

import yaml
from langchain_openai import ChatOpenAI

ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / "agent_config.yaml"

# provider name -> (base_url env var, api_key env var)
_PROVIDER_ENV = {
    "featherless": ("FEATHERLESS_BASE_URL", "FEATHERLESS_API_KEY"),
    "aiml": ("AIML_BASE_URL", "AIML_API_KEY"),
}


def load_agent_models() -> dict[str, dict]:
    """Return the {agent_name: {provider, model}} mapping from agent_config.yaml."""
    data = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    return data["agents"]


def make_llm(agent_name: str, temperature: float = 0.0) -> ChatOpenAI:
    """Build the ChatOpenAI brain for a named agent.

    Temperature 0.0 keeps both the narration AND tool-calling decisions as
    deterministic as possible — smaller/marginal models are more likely to
    reliably emit the required tool call at temp 0. It never affects the
    match/no_match verdict, which is computed deterministically elsewhere.
    """
    cfg = load_agent_models()[agent_name]
    provider = cfg["provider"]
    base_env, key_env = _PROVIDER_ENV[provider]

    base_url = os.environ.get(base_env)
    api_key = os.environ.get(key_env)
    if not base_url or not api_key:
        raise RuntimeError(
            f"Missing {base_env}/{key_env} in environment for provider "
            f"'{provider}'. Is .env present and loaded?"
        )

    return ChatOpenAI(
        model=cfg["model"],
        base_url=base_url,
        api_key=api_key,
        temperature=temperature,
        timeout=60,
        max_retries=2,
    )
