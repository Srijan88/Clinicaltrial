import os, json, requests
from dotenv import load_dotenv
load_dotenv(".env")
room = os.environ["BAND_ROOM_ID"]

# Try various status filters
for who, env_key in [("INTAKE","BAND_AGENT_KEY_INTAKE"),("DISCOVERER","BAND_AGENT_KEY_DISCOVERER"),("PARSER","BAND_AGENT_KEY_PARSER"),("ANALYZER","BAND_AGENT_KEY_ANALYZER")]:
    key = os.environ[env_key]
    print(f"\n========== {who} ==========")
    for status in ["", "?status=processed", "?status=pending", "?status=all", "?include_processed=true"]:
        url = f"https://app.band.ai/api/v1/agent/chats/{room}/messages{status}"
        r = requests.get(url, headers={"X-API-Key": key}, timeout=30)
        if r.status_code != 200:
            print(f"  {status or '(no filter)'}: status={r.status_code}")
            continue
        data = r.json()
        msgs = data.get("messages") or data.get("data") or []
        print(f"  {status or '(no filter)'}: {len(msgs)} msgs, keys={list(data.keys())[:5]}")
        for m in msgs[:4]:
            c = (m.get("content") or "")[:120].replace("\n", " ")
            mn = [x.get("handle") if isinstance(x,dict) else x for x in (m.get("mentions") or [])]
            print(f"     id={str(m.get('id',''))[:8]} mentions={mn} :: {c}")
