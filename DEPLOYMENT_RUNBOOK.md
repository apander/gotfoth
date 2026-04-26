# Deployment Runbook (Vercel + Neon + Vercel Blob)

## Required GitHub secrets

- `VERCEL_TOKEN`
- `APP_BASE_URL` (production URL for smoke checks)

## Required Vercel environment variables

- `NEON_DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN`
- `DATA_BACKEND=neon`
- `FILE_BACKEND=blob`
- `AUTH_ENABLED=true`
- `SIMPLE_AUTH_USERNAME`
- `SIMPLE_AUTH_PASSWORD`
- Optional:
  - `SIGNED_URL_TTL_SECONDS`
  - `FULL_YAML_TEXT_MAX`

## Standard production flow

1. Ensure `main` is current and CI green.
2. Take prod backup:
   - `node scripts/backup_prod_snapshot.js`
3. If required, promote dev DB to prod:
   - `node scripts/promote_dev_to_prod.js`
4. Deploy `main` to production (Vercel).
5. Run smoke checks:
   - `APP_BASE_URL=https://<prod-domain> node scripts/smoke_check_neon_blob.js`
6. Manually verify:
   - Login succeeds
   - Calendar, exams list, and feedback modal load
   - File open routes work

## Rollback

1. Re-deploy previous stable Vercel deployment.
2. Restore production DB from latest dump in `backups/`:
   - `pg_restore --dbname=\"$PROD_NEON_DATABASE_URL\" --clean --if-exists --no-owner --no-privileges backups/<snapshot>.dump`
3. Re-run smoke checks.