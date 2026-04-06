import requests

# Change this to your NAS IP
NAS_URL = "http://192.168.1.XX:8090/api/collections/papers/records"

papers = [
    # HISTORY (Already done)
    {"subject": "Psychology", "paper_title": "2023 Paper 1", "score": 58, "max_score": 100, "status": "Marked", "ai_feedback": "Focus on AO3 linking"},
    {"subject": "Business", "paper_title": "2023 Paper 1", "score": 62, "max_score": 100, "status": "Marked", "ai_feedback": "Calculation errors in Finance"},
    
    # THE SPRINT (Upcoming)
    {"subject": "Psychology", "paper_title": "2022 Paper 2", "status": "Planned", "ai_feedback": "http://nas-ip:8080/papers/psy-p2.pdf"},
    {"subject": "Business", "paper_title": "2022 Paper 2", "status": "Planned", "ai_feedback": "http://nas-ip:8080/papers/bus-p2.pdf"},
    {"subject": "Psychology", "paper_title": "2021 Paper 1", "status": "Planned", "ai_feedback": "http://nas-ip:8080/papers/psy-p1-21.pdf"}
]

for p in papers:
    r = requests.post(NAS_URL, json=p)
    print(f"{'✅' if r.ok else '❌'} {p['paper_title']}")