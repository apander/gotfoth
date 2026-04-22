import hashlib
import json
import os
import uuid
from typing import Dict, List, Optional, Tuple

import requests


def env(name: str, default: Optional[str] = None) -> str:
    v = os.getenv(name, default)
    if v is None or v == "":
        raise SystemExit(f"Missing environment variable: {name}")
    return v


PB_URL = env("PB_URL").rstrip("/")
PB_TOKEN = os.getenv("PB_AUTH_TOKEN", "")
SB_URL = env("SUPABASE_URL").rstrip("/")
SB_KEY = env("SUPABASE_SERVICE_ROLE_KEY")
TIMEOUT = float(os.getenv("MIGRATION_HTTP_TIMEOUT_SEC", "30"))

NAMESPACE_UUID = uuid.UUID("9dc641f7-6e93-4be6-b5e3-892d72401e1a")

FILE_FIELDS = [
    ("file_paper", "papers", "file_paper_path"),
    ("file_scheme", "schemes", "file_scheme_path"),
    ("file_attempt", "attempts", "file_attempt_path"),
    ("file_marking_yaml", "marking-yaml", "file_marking_yaml_path"),
]


def pb_headers() -> Dict[str, str]:
    h = {}
    if PB_TOKEN:
        h["Authorization"] = f"Bearer {PB_TOKEN}"
    return h


def sb_headers(content_type: Optional[str] = None) -> Dict[str, str]:
    h = {
        "apikey": SB_KEY,
        "Authorization": f"Bearer {SB_KEY}",
    }
    if content_type:
        h["Content-Type"] = content_type
    return h


def pb_list(collection: str) -> List[Dict]:
    page = 1
    out: List[Dict] = []
    while True:
        url = f"{PB_URL}/api/collections/{collection}/records?page={page}&perPage=200"
        r = requests.get(url, headers=pb_headers(), timeout=TIMEOUT)
        r.raise_for_status()
        data = r.json()
        items = data.get("items", [])
        out.extend(items)
        if page >= int(data.get("totalPages", 1)):
            break
        page += 1
    return out


def sb_insert(table: str, rows: List[Dict], upsert: bool = True) -> None:
    prefer = "return=minimal"
    if upsert:
        prefer = "resolution=merge-duplicates,return=minimal"
    r = requests.post(
        f"{SB_URL}/rest/v1/{table}",
        headers={**sb_headers("application/json"), "Prefer": prefer},
        data=json.dumps(rows),
        timeout=TIMEOUT,
    )
    r.raise_for_status()


def sb_storage_upload(bucket: str, object_path: str, data: bytes, content_type: str) -> str:
    r = requests.post(
        f"{SB_URL}/storage/v1/object/{bucket}/{object_path}",
        headers={**sb_headers(content_type), "x-upsert": "true"},
        data=data,
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    return f"{bucket}/{object_path}"


def stable_uuid(pb_id: str, table: str) -> str:
    return str(uuid.uuid5(NAMESPACE_UUID, f"{table}:{pb_id}"))


def pb_file_url(row: Dict, field: str) -> Optional[str]:
    name = row.get(field)
    if not name:
        return None
    cid = row.get("collectionId")
    rid = row.get("id")
    if not cid or not rid:
        return None
    return f"{PB_URL}/api/files/{cid}/{rid}/{name}"


def sanitize_filename(name: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in name)
    return safe or "file.bin"


def migrate_boundaries() -> int:
    rows = pb_list("boundaries")
    out = []
    for r in rows:
        out.append(
            {
                "id": stable_uuid(r["id"], "boundaries"),
                "paper_key": r.get("paper_key"),
                "max_mark": r.get("max_mark"),
                "a_star": r.get("a_star"),
                "a": r.get("a"),
                "b": r.get("b"),
                "c": r.get("c"),
                "d": r.get("d"),
                "e": r.get("e"),
                "created_at": r.get("created"),
                "updated_at": r.get("updated"),
            }
        )
    if out:
        sb_insert("boundaries", out, upsert=True)
    return len(out)


def migrate_settings() -> int:
    rows = pb_list("settings")
    out = []
    for r in rows:
        out.append(
            {
                "id": stable_uuid(r["id"], "settings"),
                "key": r.get("key"),
                "value": r.get("value"),
                "created_at": r.get("created"),
                "updated_at": r.get("updated"),
            }
        )
    if out:
        sb_insert("settings", out, upsert=True)
    return len(out)


def fetch_bytes(url: str) -> Tuple[bytes, str]:
    r = requests.get(url, headers=pb_headers(), timeout=TIMEOUT)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


def migrate_papers() -> Tuple[int, int]:
    rows = pb_list("papers")
    output_rows = []
    uploaded = 0
    for r in rows:
        sid = stable_uuid(r["id"], "papers")
        row = {
            "id": sid,
            "legacy_pocketbase_id": r.get("id"),
            "subject": r.get("subject"),
            "year": r.get("year"),
            "paper_type": r.get("paper_type"),
            "status": "Graded" if r.get("status") == "Marked" else r.get("status"),
            "scheduled_date": r.get("scheduled_date"),
            "score": r.get("score"),
            "max_score": r.get("max_score"),
            "ai_summary": r.get("ai_summary"),
            "full_yaml": r.get("full_yaml"),
            # PostgREST bulk inserts require every JSON object in the array to have the same keys.
            # Always include file path columns (null when absent) so rows with/without attachments match.
            "file_paper_path": None,
            "file_scheme_path": None,
            "file_attempt_path": None,
            "file_marking_yaml_path": None,
            "created_at": r.get("created"),
            "updated_at": r.get("updated"),
        }
        for field_name, bucket, path_field in FILE_FIELDS:
            url = pb_file_url(r, field_name)
            if not url:
                continue
            filename = sanitize_filename(str(r.get(field_name, field_name)))
            digest = hashlib.sha1(f"{r.get('id')}:{field_name}:{filename}".encode("utf-8")).hexdigest()[:12]
            object_path = f"{sid}/{field_name}/{digest}_{filename}"
            payload, content_type = fetch_bytes(url)
            row[path_field] = sb_storage_upload(bucket, object_path, payload, content_type)
            uploaded += 1
        output_rows.append(row)
    if output_rows:
        sb_insert("papers", output_rows, upsert=True)
    return len(output_rows), uploaded


def main() -> None:
    print("Migrating boundaries...")
    b_count = migrate_boundaries()
    print(f"Boundaries migrated: {b_count}")

    print("Migrating settings...")
    s_count = migrate_settings()
    print(f"Settings migrated: {s_count}")

    print("Migrating papers and files...")
    p_count, files_count = migrate_papers()
    print(f"Papers migrated: {p_count}")
    print(f"Files uploaded: {files_count}")
    print("Migration complete.")


if __name__ == "__main__":
    main()
