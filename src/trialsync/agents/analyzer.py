"""Analyzer agent (AI/ML API). Run: uv run python -m trialsync.agents.analyzer"""

from ..agent_common import run_agent
from ..agent_tools import compute_trial_verdicts, publish_result

if __name__ == "__main__":
    run_agent(
        "analyzer",
        "BAND_AGENT_ID_ANALYZER",
        "BAND_AGENT_KEY_ANALYZER",
        [compute_trial_verdicts, publish_result],
    )
