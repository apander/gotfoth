# PocketBase to Supabase migration

## Scope

- Collections: `papers`, `boundaries`, `settings`
- Files: `file_paper`, `file_scheme`, `file_attempt`, `file_marking_yaml`

## Script

Use:

```bash
python scripts/migrate_pocketbase_to_supabase.py
```

## Required environment variables

- `PB_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `PB_AUTH_TOKEN`
- `MIGRATION_HTTP_TIMEOUT_SEC`

## What the script does

1. Reads all rows from PocketBase collections.
2. Creates stable UUID ids in Supabase (deterministic from PocketBase id).
3. Downloads each PocketBase file and uploads it into matching Supabase bucket.
4. Writes storage paths into `papers.file_*_path` columns.
5. Upserts table rows into Supabase.

## Validation

Run:

```bash
python scripts/validate_supabase_parity.py
```

This checks table counts between PocketBase and Supabase for `papers`, `boundaries`, `settings`.
