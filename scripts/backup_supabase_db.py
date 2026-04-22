import argparse
import datetime as dt
import gzip
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(code)


def require_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        die(f"Missing environment variable: {name}")
    return v


def find_pg_dump(explicit: Optional[str]) -> str:
    if explicit:
        p = Path(explicit)
        if not p.exists():
            die(f"--pg-dump path does not exist: {explicit}")
        return str(p)

    resolved = shutil.which("pg_dump")
    if not resolved:
        die(
            "Could not find `pg_dump` on PATH.\n"
            "Install PostgreSQL client tools (includes `pg_dump`), "
            "or pass --pg-dump with the full path to pg_dump.exe."
        )
    return resolved


def default_sql_path(out_dir: Path, gz: bool) -> Path:
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    suffix = ".sql.gz" if gz else ".sql"
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / f"supabase-db-backup-{stamp}{suffix}"


def pg_dump_env() -> dict:
    env = os.environ.copy()
    env.setdefault("PGCLIENTENCODING", "UTF8")
    return env


def atomic_replace(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    src.replace(dst)


def run_pg_dump_plain_to_file(pg_dump: str, database_url: str, out_sql: Path) -> None:
    cmd = [
        pg_dump,
        "--format",
        "p",
        "--no-owner",
        "--no-privileges",
        "--dbname",
        database_url,
    ]

    out_sql.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=out_sql.name + ".", suffix=".partial", dir=str(out_sql.parent))
    os.close(fd)
    tmp_path = Path(tmp_name)

    try:
        with tmp_path.open("wb") as f_out:
            proc = subprocess.run(
                cmd,
                stdout=f_out,
                stderr=subprocess.PIPE,
                check=False,
                env=pg_dump_env(),
            )
        if proc.returncode != 0:
            stderr = proc.stderr.decode("utf-8", errors="replace")
            die(f"pg_dump failed ({proc.returncode}):\n{stderr}")
        atomic_replace(tmp_path, out_sql)
    finally:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass


def run_pg_dump_custom_to_file(pg_dump: str, database_url: str, out_dump: Path) -> None:
    out_dump.parent.mkdir(parents=True, exist_ok=True)

    fd, tmp_name = tempfile.mkstemp(prefix=out_dump.name + ".", suffix=".partial", dir=str(out_dump.parent))
    os.close(fd)
    tmp_path = Path(tmp_name)

    cmd = [
        pg_dump,
        "--format",
        "c",
        "--no-owner",
        "--no-privileges",
        "--file",
        str(tmp_path),
        "--dbname",
        database_url,
    ]

    try:
        proc = subprocess.run(cmd, stderr=subprocess.PIPE, check=False, env=pg_dump_env())
        if proc.returncode != 0:
            stderr = proc.stderr.decode("utf-8", errors="replace")
            die(f"pg_dump failed ({proc.returncode}):\n{stderr}")
        atomic_replace(tmp_path, out_dump)
    finally:
        if tmp_path.exists() and tmp_path != out_dump:
            try:
                tmp_path.unlink()
            except OSError:
                pass


def gzip_file_inplace(sql_path: Path, gz_path: Path) -> None:
    with sql_path.open("rb") as f_in:
        with gzip.open(gz_path, "wb", compresslevel=9) as f_out:
            shutil.copyfileobj(f_in, f_out)
    sql_path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backup Supabase Postgres to a local file using pg_dump."
    )
    parser.add_argument(
        "--database-url-env",
        default="SUPABASE_DB_URL",
        help="Env var containing the Postgres connection string (default: SUPABASE_DB_URL).",
    )
    parser.add_argument(
        "--out",
        default="",
        help="Output path. Defaults to backups/supabase-db-backup-<utc>.sql|.sql.gz|.dump",
    )
    parser.add_argument(
        "--out-dir",
        default="backups",
        help="Directory used for default output filenames.",
    )
    parser.add_argument(
        "--custom",
        action="store_true",
        help="Write pg_dump custom format (-Fc) to a .dump file (great for pg_restore).",
    )
    parser.add_argument(
        "--gzip",
        action="store_true",
        help="Gzip plain SQL output to .sql.gz (ignored with --custom).",
    )
    parser.add_argument(
        "--pg-dump",
        default="",
        help="Optional full path to pg_dump (otherwise searches PATH).",
    )

    args = parser.parse_args()

    database_url = require_env(args.database_url_env)
    pg_dump = find_pg_dump(args.pg_dump or None)

    custom = bool(args.custom)
    gzip_sql = bool(args.gzip) and not custom

    out_dir = Path(args.out_dir)

    if custom:
        out_path = Path(args.out) if args.out else out_dir / (
            "supabase-db-backup-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".dump"
        )
        if not str(out_path).lower().endswith(".dump"):
            die("When using --custom, use an output filename ending with .dump (or omit --out).")
        run_pg_dump_custom_to_file(pg_dump, database_url, out_path)
        print(f"Wrote custom-format backup: {out_path.resolve()}")
        return

    # Plain SQL (optionally gzipped)
    if args.out:
        out_path = Path(args.out)
    else:
        out_path = default_sql_path(out_dir, gz=gzip_sql)

    if gzip_sql:
        if str(out_path).lower().endswith(".gz"):
            sql_tmp = Path(str(out_path)[:-3])
            gz_final = out_path
        else:
            sql_tmp = out_path if str(out_path).lower().endswith(".sql") else out_path.with_suffix(".sql")
            gz_final = Path(str(sql_tmp) + ".gz")

        run_pg_dump_plain_to_file(pg_dump, database_url, sql_tmp)
        gzip_file_inplace(sql_tmp, gz_final)
        print(f"Wrote gzipped SQL backup: {gz_final.resolve()}")
        return

    run_pg_dump_plain_to_file(pg_dump, database_url, out_path)
    print(f"Wrote SQL backup: {out_path.resolve()}")


if __name__ == "__main__":
    main()
