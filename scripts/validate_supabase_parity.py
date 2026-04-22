import os
from typing import Dict, Optional

import requests


def env(name: str, default: Optional[str] = None) -> str:
    v = os.getenv(name, default)
    if v is None or v == "":
        raise SystemExit(f"Missing env var: {name}")
    return v


PB_URL = env("PB_URL").rstrip("/")
PB_TOKEN = os.getenv("PB_AUTH_TOKEN", "")
SB_URL = env("SUPABASE_URL").rstrip("/")
SB_KEY = env("SUPABASE_SERVICE_ROLE_KEY")
TIMEOUT = float(os.getenv("PARITY_HTTP_TIMEOUT_SEC", "20"))


def pb_headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {PB_TOKEN}"} if PB_TOKEN else {}


def sb_headers() -> Dict[str, str]:
    return {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}


def pb_count(collection: str) -> int:
    r = requests.get(
        f"{PB_URL}/api/collections/{collection}/records?page=1&perPage=1",
        headers=pb_headers(),
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    return int(r.json().get("totalItems", 0))


def sb_count(table: str) -> int:
    r = requests.get(
        f"{SB_URL}/rest/v1/{table}?select=id",
        headers={**sb_headers(), "Prefer": "count=exact"},
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    return int(r.headers.get("content-range", "0-0/0").split("/")[-1])


def assert_equal(name: str, a: int, b: int) -> None:
    if a != b:
        raise SystemExit(f"{name} count mismatch: pocketbase={a} supabase={b}")
    print(f"{name}: OK ({a})")


def main() -> None:
    assert_equal("papers", pb_count("papers"), sb_count("papers"))
    assert_equal("boundaries", pb_count("boundaries"), sb_count("boundaries"))
    assert_equal("settings", pb_count("settings"), sb_count("settings"))
    print("Parity check passed.")


if __name__ == "__main__":
    main()
