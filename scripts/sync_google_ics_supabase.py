import datetime as dt
import hashlib
import json
import os
from typing import Dict, List, Optional

import requests


def env(name: str, default: Optional[str] = None) -> str:
    val = os.getenv(name, default)
    if val is None or val == "":
        raise SystemExit(f"Missing required environment variable: {name}")
    return val


SUPABASE_URL = env("SUPABASE_URL").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY")
GCAL_ICS_URL = env("GCAL_ICS_URL")
KEY_PREFIX = os.getenv("GCAL_EVENT_KEY_PREFIX", "gcal_evt_")
SYNC_STATUS_KEY = os.getenv("GCAL_SYNC_STATUS_KEY", "gcal_sync_status")
PAST_DAYS = int(os.getenv("GCAL_SYNC_PAST_DAYS", "30"))
FUTURE_DAYS = int(os.getenv("GCAL_SYNC_FUTURE_DAYS", "365"))
TIMEOUT_SEC = float(os.getenv("SYNC_HTTP_TIMEOUT_SEC", "20"))


def sb_headers(content_type: Optional[str] = None) -> Dict[str, str]:
    h = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }
    if content_type:
        h["Content-Type"] = content_type
    return h


def sb_select_settings() -> List[Dict]:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/settings?select=id,key,value&limit=5000",
        headers=sb_headers(),
        timeout=TIMEOUT_SEC,
    )
    r.raise_for_status()
    return r.json()


def sb_upsert_setting(key: str, value: str) -> None:
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/settings",
        headers={**sb_headers("application/json"), "Prefer": "resolution=merge-duplicates,return=minimal"},
        data=json.dumps([{"key": key, "value": value}]),
        timeout=TIMEOUT_SEC,
    )
    r.raise_for_status()


def sb_delete_setting(record_id: str) -> None:
    r = requests.delete(
        f"{SUPABASE_URL}/rest/v1/settings?id=eq.{record_id}",
        headers={**sb_headers(), "Prefer": "return=minimal"},
        timeout=TIMEOUT_SEC,
    )
    r.raise_for_status()


def unfold_ics_lines(text: str) -> List[str]:
    raw = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out: List[str] = []
    for line in raw:
        if line.startswith(" ") or line.startswith("\t"):
            if out:
                out[-1] += line[1:]
            continue
        out.append(line)
    return out


def parse_prop(line: str) -> (str, Dict[str, str], str):
    if ":" not in line:
        return line, {}, ""
    left, value = line.split(":", 1)
    parts = left.split(";")
    name = parts[0].strip().upper()
    params: Dict[str, str] = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            params[k.strip().upper()] = v.strip()
    return name, params, value.strip()


def parse_dtstart(value: str, params: Dict[str, str]) -> Optional[dt.date]:
    if not value:
        return None
    is_date = params.get("VALUE", "").upper() == "DATE" or len(value) == 8
    if is_date:
        try:
            return dt.datetime.strptime(value[:8], "%Y%m%d").date()
        except ValueError:
            return None
    try:
        if value.endswith("Z"):
            d = dt.datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc)
            return d.astimezone().date()
        d = dt.datetime.strptime(value[:15], "%Y%m%dT%H%M%S")
        return d.date()
    except ValueError:
        return None


def parse_events(ics_text: str) -> List[Dict[str, str]]:
    lines = unfold_ics_lines(ics_text)
    in_event = False
    current: Dict[str, str] = {}
    events: List[Dict[str, str]] = []

    for line in lines:
        tag = line.strip().upper()
        if tag == "BEGIN:VEVENT":
            in_event = True
            current = {}
            continue
        if tag == "END:VEVENT":
            in_event = False
            if current.get("date") and current.get("label"):
                events.append(current)
            current = {}
            continue
        if not in_event:
            continue

        name, params, value = parse_prop(line)
        if name == "SUMMARY":
            current["label"] = value
        elif name == "UID":
            current["uid"] = value
        elif name == "DTSTART":
            d = parse_dtstart(value, params)
            if d:
                current["date"] = d.isoformat()
    return events


def in_window(date_iso: str, today: dt.date) -> bool:
    d = dt.date.fromisoformat(date_iso)
    return (today - dt.timedelta(days=PAST_DAYS)) <= d <= (today + dt.timedelta(days=FUTURE_DAYS))


def desired_records(events: List[Dict[str, str]]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    today = dt.date.today()
    for ev in events:
        if not in_window(ev["date"], today):
            continue
        uid_base = ev.get("uid") or f'{ev["date"]}:{ev["label"]}'
        digest = hashlib.sha1(uid_base.encode("utf-8")).hexdigest()[:16]
        key = f"{KEY_PREFIX}{digest}"
        payload = {
            "date": ev["date"],
            "label": ev["label"],
            "uid": ev.get("uid", ""),
            "source": "google_ics",
        }
        out[key] = json.dumps(payload, separators=(",", ":"))
    return out


def main() -> None:
    print("Fetching Google ICS feed...")
    r = requests.get(GCAL_ICS_URL, timeout=TIMEOUT_SEC)
    r.raise_for_status()
    events = parse_events(r.text)
    wanted = desired_records(events)
    print(f"Parsed {len(events)} events, {len(wanted)} in sync window.")

    existing = sb_select_settings()
    existing_by_key = {str(x.get("key", "")): x for x in existing}
    managed = [x for x in existing if str(x.get("key", "")).startswith(KEY_PREFIX)]

    creates = 0
    updates = 0
    deletes = 0

    for key, value in wanted.items():
        row = existing_by_key.get(key)
        if not row:
            sb_upsert_setting(key, value)
            creates += 1
            continue
        if str(row.get("value", "")) != value:
            sb_upsert_setting(key, value)
            updates += 1

    wanted_keys = set(wanted.keys())
    for row in managed:
        if row["key"] not in wanted_keys:
            sb_delete_setting(row["id"])
            deletes += 1

    status_payload = {
        "last_sync": dt.datetime.now(dt.timezone.utc).isoformat(),
        "events_total": len(events),
        "events_in_window": len(wanted),
        "source": "google_ics",
    }
    sb_upsert_setting(SYNC_STATUS_KEY, json.dumps(status_payload, separators=(",", ":")))

    print(f"Done. created={creates}, updated={updates}, deleted={deletes}")


if __name__ == "__main__":
    main()
