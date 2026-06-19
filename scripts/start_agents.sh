#!/usr/bin/env bash
# Start the four TrialSync Band agents as background processes.
# Usage:  ./scripts/start_agents.sh        (Ctrl+C stops all of them)
#
# Requires uv on PATH and a populated .env at the repo root. Agents show OFFLINE
# in the Band UI until these processes are running.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

pids=()
cleanup() {
  echo "Stopping agents..."
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

for a in intake discoverer parser analyzer; do
  echo "Launching agent: $a"
  uv run python -m trialsync.agents."$a" &
  pids+=($!)
  sleep 1
done

echo ""
echo "All four agents launched (pids: ${pids[*]})."
echo "In another terminal run:  uv run trialsync match-agents P001"
wait
