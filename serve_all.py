"""Single-container launcher for deployment (e.g. Railway).

Starts the FastAPI API plus the four Band agent processes inside ONE container.
They must share a filesystem because the analyzer writes the final result to
data/cache/agent_results/<pid>.json which the API reads back — splitting them
across machines would break that hand-off.

Locally you can still run each piece separately (see SETUP.md); this script is
purely for a one-service cloud deploy.

Start command (Procfile `web`):  python serve_all.py
The API binds to $PORT (Railway injects it); defaults to 8000.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"

PORT = os.environ.get("PORT", "8000")

# Ensure the `trialsync` package is importable whether or not it was pip-installed.
ENV = os.environ.copy()
existing_pp = ENV.get("PYTHONPATH", "")
ENV["PYTHONPATH"] = str(SRC) + (os.pathsep + existing_pp if existing_pp else "")

PY = sys.executable

PROCS = [
    ("api", [PY, "-m", "uvicorn", "trialsync.api:app", "--host", "0.0.0.0", "--port", PORT]),
    ("intake", [PY, "-m", "trialsync.agents.intake"]),
    ("discoverer", [PY, "-m", "trialsync.agents.discoverer"]),
    ("parser", [PY, "-m", "trialsync.agents.parser"]),
    ("analyzer", [PY, "-m", "trialsync.agents.analyzer"]),
]


def main() -> int:
    children: list[subprocess.Popen] = []
    print(f"[serve_all] launching {len(PROCS)} processes (API on :{PORT})", flush=True)

    for name, cmd in PROCS:
        print(f"[serve_all] starting {name}: {' '.join(cmd)}", flush=True)
        # Inherit stdout/stderr so all logs stream to the platform log viewer.
        children.append(subprocess.Popen(cmd, cwd=str(ROOT), env=ENV))

    def shutdown(*_: object) -> None:
        print("[serve_all] shutting down children…", flush=True)
        for p in children:
            if p.poll() is None:
                p.terminate()
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    # If any child exits, tear everything down so the platform restarts the
    # whole service (keeps the pipeline consistent rather than half-running).
    while True:
        for p in children:
            code = p.poll()
            if code is not None:
                print(f"[serve_all] a child exited with code {code}; stopping all", flush=True)
                shutdown()
        try:
            children[0].wait(timeout=3)
            # api exited
            shutdown()
        except subprocess.TimeoutExpired:
            continue


if __name__ == "__main__":
    raise SystemExit(main())
