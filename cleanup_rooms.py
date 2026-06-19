"""One-time: detach all four agents from every chat they belong to.

Per-run rooms accumulated during development; the running agents were polling
ALL of them. This removes each agent from every chat so a fresh agent restart
starts lean (only rooms created by future runs will be joined). Safe to run when
no match is in flight.

Run:  uv run python cleanup_rooms.py
"""
from __future__ import annotations

import os

import requests
from dotenv import load_dotenv

load_dotenv(".env")
BASE = "https://app.band.ai/api/v1"

AGENTS = [
    ("intake", os.environ["BAND_AGENT_KEY_INTAKE"], os.environ["BAND_AGENT_ID_INTAKE"]),
    ("discoverer", os.environ["BAND_AGENT_KEY_DISCOVERER"], os.environ["BAND_AGENT_ID_DISCOVERER"]),
    ("parser", os.environ["BAND_AGENT_KEY_PARSER"], os.environ["BAND_AGENT_ID_PARSER"]),
    ("analyzer", os.environ["BAND_AGENT_KEY_ANALYZER"], os.environ["BAND_AGENT_ID_ANALYZER"]),
]


def list_chats(key: str) -> list[str]:
    ids: list[str] = []
    page = 1
    while True:
        r = requests.get(f"{BASE}/agent/chats?page={page}&page_size=100",
                         headers={"X-API-Key": key}, timeout=30)
        if r.status_code != 200:
            break
        data = r.json().get("data") or []
        if not data:
            break
        ids.extend([c["id"] for c in data if c.get("id")])
        if len(data) < 100:
            break
        page += 1
    return ids


def main() -> int:
    for role, key, aid in AGENTS:
        chats = list_chats(key)
        removed = 0
        for room in chats:
            r = requests.delete(f"{BASE}/agent/chats/{room}/participants/{aid}",
                                headers={"X-API-Key": key}, timeout=20)
            if r.status_code in (200, 204):
                removed += 1
        print(f"{role:11s}: was in {len(chats)} chat(s), removed from {removed}")
    print("\nDone. Restart the agents so they re-subscribe to nothing (lean start).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
