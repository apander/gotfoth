# Cloud Setup (Vercel + Neon + Vercel Blob)

## 1) Neon setup

1. Create two Neon databases/branches:
   - `preview` (or dev)
   - `production`
2. Set connection strings:
   - `DEV_NEON_DATABASE_URL`
   - `PROD_NEON_DATABASE_URL`
   - `NEON_DATABASE_URL` (runtime DB used by deployed app per environment)
3. Apply schema:
   - `node scripts/apply_neon_schema.js`

## 2) Vercel Blob setup

1. Enable Blob for the Vercel project.
2. Add:
   - `BLOB_READ_WRITE_TOKEN`
   - Optional: `BLOB_PUBLIC_BASE_URL`

## 3) Vercel project environment

Required env vars (Production + Preview):

- `NEON_DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN`
- `DATA_BACKEND=neon`
- `FILE_BACKEND=blob`
- `AUTH_ENABLED=true`
- `SIMPLE_AUTH_USERNAME`
- `SIMPLE_AUTH_PASSWORD`
- Optional:
  - `SIGNED_URL_TTL_SECONDS` (default `3600`)
  - `FULL_YAML_TEXT_MAX` (default `5000`)

## 4) Local ops tooling

- Install PostgreSQL CLI (`pg_dump`, `pg_restore`, `psql`) or set:
  - `PG_BIN_DIR`
- Optional:
  - `BACKUP_DIR=./backups`

## 5) Safety and access

- Keep DB and Blob tokens server-side only.
- File access should go through `/api/files/papers/:id/:field`.
- Use DB operations scripts before any production cutover:
  - `scripts/backup_prod_snapshot.js`
  - `scripts/promote_dev_to_prod.js`
  - `scripts/refresh_dev_from_prod.js`