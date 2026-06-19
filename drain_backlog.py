"""Drain any unprocessed messages from the room for all four agents.

Call this before restarting agents if you suspect stale backlog. It pulls
/messages/next until 204 for each agent and marks each pulled message processed.
"""
import os, requests
from dotenv import load_dotenv
load_dotenv(".env")
room = os.environ["BAND_ROOM_ID"]
for who, env_key in [("intake","BAND_AGENT_KEY_INTAKE"),("discoverer","BAND_AGENT_KEY_DISCOVERER"),("parser","BAND_AGENT_KEY_PARSER"),("analyzer","BAND_AGENT_KEY_ANALYZER")]:
    key = os.environ[env_key]
    h = {"X-API-Key": key}
    drained = 0
    while True:
        r = requests.get(f"https://app.band.ai/api/v1/agent/chats/{room}/messages/next", headers=h, timeout=30)
        if r.status_code == 204:
            break
        if r.status_code != 200:
            print(f"{who}: unexpected {r.status_code}: {r.text[:120]}")
            break
        msg = r.json().get("data") or r.json()
        mid = msg.get("id") if isinstance(msg, dict) else None
        if not mid:
            break
        # mark processing then processed
        requests.post(f"https://app.band.ai/api/v1/agent/chats/{room}/messages/{mid}/processing", headers=h, timeout=30)
        requests.post(f"https://app.band.ai/api/v1/agent/chats/{room}/messages/{mid}/processed", headers=h, timeout=30)
        drained += 1
    print(f"{who}: drained {drained}")
