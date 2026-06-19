"""Drain stale backlog for ALL four agents across EVERY room they belong to.

After errored runs, rooms can hold unprocessed messages that an agent re-attacks
on (re)connect — looping on 422s when other agents were removed. This marks every
pending message processed for each agent across all its chats, giving a clean
slate. Safe to run when no match is in flight.

Run:  uv run python drain_all.py
"""
from __future__ import annotations

import os

import requests
from dotenv import load_dotenv

load_dotenv(".env")
BASE = "https://app.band.ai/api/v1"

AGENTS = [
    ("intake", os.environ["BAND_AGENT_KEY_INTAKE"]),
    ("discoverer", os.environ["BAND_AGENT_KEY_DISCOVERER"]),
    ("parser", os.environ["BAND_AGENT_KEY_PARSER"]),
    ("analyzer", os.environ["BAND_AGENT_KEY_ANALYZER"]),
]


def list_chats(key: str) -> list[str]:
    ids, page = [], 1
    while True:
        r = requests.get(f"{BASE}/agent/chats?page={page}&page_size=100",
                         headers={"X-API-Key": key}, timeout=30)
        if r.status_code != 200:
            break
        data = r.json().get("data") or []
        if not data:
            break
        ids += [c["id"] for c in data if c.get("id")]
        if len(data) < 100:
            break
        page += 1
    return ids


def drain_chat(key: str, room: str) -> int:
    h = {"X-API-Key": key}
    n = 0
    while True:
        r = requests.get(f"{BASE}/agent/chats/{room}/messages/next", headers=h, timeout=30)
        if r.status_code != 200:
            break
        msg = r.json().get("data") or r.json()
        mid = msg.get("id") if isinstance(msg, dict) else None
        if not mid:
            break
        requests.post(f"{BASE}/agent/chats/{room}/messages/{mid}/processing", headers=h, timeout=30)
        requests.post(f"{BASE}/agent/chats/{room}/messages/{mid}/processed", headers=h, timeout=30)
        n += 1
        if n > 200:  # safety
            break
    return n


def main() -> int:
    for role, key in AGENTS:
        chats = list_chats(key)
        total = sum(drain_chat(key, room) for room in chats)
        print(f"{role:11s}: {len(chats)} chat(s), drained {total} message(s)")
    print("\nDone. Backlog cleared across all rooms.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
