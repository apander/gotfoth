import os
import requests

API_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:3000").rstrip("/")
SETTINGS_URL = f"{API_BASE_URL}/api/collections/settings/records"

exams = [
    {"key": "bus_p1_date", "value": "2026-05-06 09:00:00.000Z"},
    {"key": "bus_p2_date", "value": "2026-05-11 09:00:00.000Z"},
    {"key": "psy_p1_date", "value": "2026-05-11 13:00:00.000Z"},
    {"key": "psy_p2_date", "value": "2026-05-19 13:00:00.000Z"}
]

for e in exams:
    r = requests.post(SETTINGS_URL, json=e)
    print(f"{'✅' if r.ok else '❌'} Added {e['key']}")