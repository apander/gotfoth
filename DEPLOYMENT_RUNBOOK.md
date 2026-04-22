# Deployment Runbook (Vercel + Supabase)

## Required GitHub secrets

- `VERCEL_TOKEN`
- `APP_BASE_URL` (production app URL for health checks)
- `PB_URL` (for migration/parity jobs)
- `PB_AUTH_TOKEN` (optional if PocketBase allows public reads)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Required Vercel environment variables

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (serverless only)
- `GCAL_ICS_URL`
- `SYNC_CRON_TOKEN`
- `SIGNED_URL_TTL_SECONDS`
- `FULL_YAML_TEXT_MAX`

## Cutover checklist

1. Apply Supabase migration SQL.
2. Run PocketBase → Supabase migration:
   - `python scripts/migrate_pocketbase_to_supabase.py`
3. Run parity validation:
   - `python scripts/validate_supabase_parity.py`
4. Merge to `main` (triggers production workflow).
5. Confirm:
   - `/api/health` returns `{ ok: true }`
   - file open/view works for paper/scheme/attempt/marking YAML
   - create/edit/grade/delete flows work.
6. Freeze NAS writes and switch primary URL to Vercel.

## Rollback

1. Revert to previous Vercel deployment from Vercel dashboard.
2. If needed, restore Supabase database snapshot.
3. Re-enable NAS/PocketBase write path only if rollback confirmed.
