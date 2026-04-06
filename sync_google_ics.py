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


PB_URL = os.getenv("PB_URL", "http://mycloudex2ultra.local:8090").rstrip("/")
PB_COLLECTION = os.getenv("PB_SETTINGS_COLLECTION", "settings")
PB_TOKEN = os.getenv("PB_AUTH_TOKEN", "")
GCAL_ICS_URL = env("GCAL_ICS_URL")
KEY_PREFIX = os.getenv("GCAL_EVENT_KEY_PREFIX", "gcal_evt_")
SYNC_STATUS_KEY = os.getenv("GCAL_SYNC_STATUS_KEY", "gcal_sync_status")
PAST_DAYS = int(os.getenv("GCAL_SYNC_PAST_DAYS", "30"))
FUTURE_DAYS = int(os.getenv("GCAL_SYNC_FUTURE_DAYS", "365"))
TIMEOUT_SEC = float(os.getenv("SYNC_HTTP_TIMEOUT_SEC", "20"))


def headers() -> Dict[str, str]:
    h = {"Content-Type": "application/json"}
    if PB_TOKEN:
        h["Authorization"] = f"Bearer {PB_TOKEN}"
    return h


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
    cleaned = value
    try:
        if cleaned.endswith("Z"):
            d = dt.datetime.strptime(cleaned, "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc)
            return d.astimezone().date()
        d = dt.datetime.strptime(cleaned[:15], "%Y%m%dT%H%M%S")
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


def pb_get_settings() -> List[Dict]:
    url = f"{PB_URL}/api/collections/{PB_COLLECTION}/records?perPage=500"
    r = requests.get(url, headers=headers(), timeout=TIMEOUT_SEC)
    r.raise_for_status()
    return r.json().get("items", [])


def pb_create(key: str, value: str) -> None:
    url = f"{PB_URL}/api/collections/{PB_COLLECTION}/records"
    body = {"key": key, "value": value}
    r = requests.post(url, headers=headers(), data=json.dumps(body), timeout=TIMEOUT_SEC)
    r.raise_for_status()


def pb_patch(record_id: str, value: str) -> None:
    url = f"{PB_URL}/api/collections/{PB_COLLECTION}/records/{record_id}"
    body = {"value": value}
    r = requests.patch(url, headers=headers(), data=json.dumps(body), timeout=TIMEOUT_SEC)
    r.raise_for_status()


def pb_delete(record_id: str) -> None:
    url = f"{PB_URL}/api/collections/{PB_COLLECTION}/records/{record_id}"
    r = requests.delete(url, headers=headers(), timeout=TIMEOUT_SEC)
    r.raise_for_status()


def pb_upsert_by_key(existing_by_key: Dict[str, Dict], key: str, value: str) -> None:
    row = existing_by_key.get(key)
    if row:
        if str(row.get("value", "")) != value:
            pb_patch(row["id"], value)
        return
    pb_create(key, value)


def main() -> None:
    print("Fetching Google ICS feed...")
    r = requests.get(GCAL_ICS_URL, timeout=TIMEOUT_SEC)
    r.raise_for_status()
    events = parse_events(r.text)
    wanted = desired_records(events)
    print(f"Parsed {len(events)} events, {len(wanted)} in sync window.")

    existing = pb_get_settings()
    existing_by_key = {str(x.get("key", "")): x for x in existing}
    managed = [x for x in existing if str(x.get("key", "")).startswith(KEY_PREFIX)]
    managed_by_key = {x["key"]: x for x in managed}

    creates = 0
    updates = 0
    deletes = 0

    for key, value in wanted.items():
        row = managed_by_key.get(key)
        if not row:
            pb_create(key, value)
            creates += 1
            continue
        if str(row.get("value", "")) != value:
            pb_patch(row["id"], value)
            updates += 1

    wanted_keys = set(wanted.keys())
    for row in managed:
        if row["key"] not in wanted_keys:
            pb_delete(row["id"])
            deletes += 1

    status_payload = {
        "last_sync": dt.datetime.now(dt.timezone.utc).isoformat(),
        "events_total": len(events),
        "events_in_window": len(wanted),
        "source": "google_ics",
    }
    pb_upsert_by_key(existing_by_key, SYNC_STATUS_KEY, json.dumps(status_payload, separators=(",", ":")))

    print(f"Done. created={creates}, updated={updates}, deleted={deletes}")


if __name__ == "__main__":
    main()
