"""Parser agent (Featherless). Run: uv run python -m trialsync.agents.parser"""

from ..agent_common import run_agent
from ..agent_tools import get_trial_criteria, list_candidate_trials

if __name__ == "__main__":
    run_agent(
        "parser",
        "BAND_AGENT_ID_PARSER",
        "BAND_AGENT_KEY_PARSER",
        [list_candidate_trials, get_trial_criteria],
    )
