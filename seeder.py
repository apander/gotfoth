import os
import requests

API_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:3000").rstrip("/")
PAPERS_URL = f"{API_BASE_URL}/api/collections/papers/records"

papers = [
    {
        "subject": "Psychology",
        "year": "2023",
        "paper_type": "Psychology P1",
        "score": 58,
        "max_score": 100,
        "status": "Marked",
    },
    {
        "subject": "Business Studies",
        "year": "2023",
        "paper_type": "Business P1",
        "score": 62,
        "max_score": 100,
        "status": "Marked",
    },
    {"subject": "Psychology", "year": "2022", "paper_type": "Psychology P2", "status": "Planned"},
    {"subject": "Business Studies", "year": "2022", "paper_type": "Business P2", "status": "Planned"},
    {"subject": "Psychology", "year": "2021", "paper_type": "Psychology P1", "status": "Planned"},
]

for p in papers:
    r = requests.post(PAPERS_URL, json=p)
    label = f"{p.get('subject')} {p.get('paper_type')} {p.get('year', '')}"
    print(f"{'OK' if r.ok else 'FAIL'} {label}")
