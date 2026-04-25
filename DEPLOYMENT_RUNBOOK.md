# Deployment Runbook (Vercel + Neon + Vercel Blob)

## Required GitHub secrets

- `VERCEL_TOKEN`
- `APP_BASE_URL` (production app URL for health checks)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEON_DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN`

## Required Vercel environment variables

- `DATA_BACKEND` (`neon` in target state)
- `FILE_BACKEND` (`blob` in target state)
- `NEON_DATABASE_URL` (serverless only)
- `BLOB_READ_WRITE_TOKEN` (serverless only)
- `SIGNED_URL_TTL_SECONDS`
- `FULL_YAML_TEXT_MAX`
- Transition-only rollback vars:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

## Cutover checklist

1. Apply Neon schema:
   - `node scripts/apply_neon_schema.js`
2. Run Supabase -> Neon table migration:
   - `node scripts/migrate_supabase_to_neon.js`
3. Run Supabase Storage -> Blob migration:
   - `node scripts/migrate_supabase_files_to_blob.js`
4. Run parity validation:
   - `node scripts/validate_neon_parity.js`
5. Merge to `main` (triggers production workflow).
6. Confirm:
   - `/api/health` returns `{ ok: true }`
   - file open/view works for paper/scheme/attempt/marking YAML
   - create/edit/grade/delete flows work.
7. Keep fallback by preserving Supabase snapshot and env rollback settings.

## Rollback

1. Revert to previous Vercel deployment from Vercel dashboard.
2. Switch env vars to `DATA_BACKEND=supabase` and `FILE_BACKEND=supabase`.
3. Redeploy and validate health + file routes.
