"""Discoverer agent (Featherless). Run: uv run python -m trialsync.agents.discoverer"""

from ..agent_common import run_agent
from ..agent_tools import list_candidate_trials

if __name__ == "__main__":
    run_agent(
        "discoverer",
        "BAND_AGENT_ID_DISCOVERER",
        "BAND_AGENT_KEY_DISCOVERER",
        [list_candidate_trials],
    )
