# Supabase to Neon + Vercel Blob migration

## Scope

- Tables: `papers`, `boundaries`, `settings`
- Files: `file_paper`, `file_scheme`, `file_attempt`, `file_marking_yaml` (from Supabase Storage to Blob)

## Migration scripts

Apply schema and seed to Neon:

```bash
node scripts/apply_neon_schema.js
```

Copy table rows from Supabase to Neon:

```bash
node scripts/migrate_supabase_to_neon.js
```

Copy file objects from Supabase Storage to Vercel Blob and patch `papers.file_*_path`:

```bash
node scripts/migrate_supabase_files_to_blob.js
```

## Required environment variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEON_DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN` (for file migration only)
- `DATA_BACKEND` / `FILE_BACKEND` (for app cutover flags)

Optional:

- `BLOB_PUBLIC_BASE_URL`

## What the migration does

1. Replays SQL migrations/seed onto Neon.
2. Reads all table rows from Supabase REST (`boundaries`, `settings`, `papers`).
3. Upserts rows into Neon using `id` conflict handling.
4. Downloads Supabase Storage objects referenced by `papers.file_*_path`.
5. Uploads to Vercel Blob and rewrites those path fields to Blob URLs.

## Validation

Run:

```bash
node scripts/validate_neon_parity.js
```

This checks row-count parity between Supabase and Neon for `papers`, `boundaries`, `settings`.
