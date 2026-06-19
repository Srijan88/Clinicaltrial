"""Intake agent (Featherless). Run: uv run python -m trialsync.agents.intake"""

from ..agent_common import run_agent
from ..agent_tools import get_patient_summary

if __name__ == "__main__":
    run_agent(
        "intake",
        "BAND_AGENT_ID_INTAKE",
        "BAND_AGENT_KEY_INTAKE",
        [get_patient_summary],
    )
