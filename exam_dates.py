import requests

NAS_URL = "http://mycloudex2ultra.local:8090/api/collections/settings/records"

exams = [
    {"key": "bus_p1_date", "value": "2026-05-06 09:00:00.000Z"},
    {"key": "bus_p2_date", "value": "2026-05-11 09:00:00.000Z"},
    {"key": "psy_p1_date", "value": "2026-05-11 13:00:00.000Z"},
    {"key": "psy_p2_date", "value": "2026-05-19 13:00:00.000Z"}
]

for e in exams:
    r = requests.post(NAS_URL, json=e)
    print(f"{'✅' if r.ok else '❌'} Added {e['key']}")