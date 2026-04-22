import os
from typing import Optional

import requests


def env(name: str, default: Optional[str] = None) -> str:
    v = os.getenv(name, default)
    if v is None or v == "":
        raise SystemExit(f"Missing env var: {name}")
    return v


APP_BASE_URL = env("APP_BASE_URL").rstrip("/")
TIMEOUT = float(os.getenv("SMOKE_HTTP_TIMEOUT_SEC", "20"))


def assert_ok(path: str) -> None:
    url = f"{APP_BASE_URL}{path}"
    r = requests.get(url, timeout=TIMEOUT)
    if r.status_code >= 400:
        raise SystemExit(f"{path} failed with {r.status_code}: {r.text[:300]}")
    print(f"OK {path}")


def main() -> None:
    assert_ok("/api/health")
    assert_ok("/api/collections/boundaries/records")
    assert_ok("/api/collections/settings/records?perPage=5")
    assert_ok("/api/collections/papers/records?perPage=5")
    print("Smoke checks passed.")


if __name__ == "__main__":
    main()
