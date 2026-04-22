# Cloud Setup (Vercel + Supabase)

## 1) Supabase project setup

1. Create a new Supabase project.
2. Copy credentials into Vercel and local env:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
3. Apply SQL migrations from `supabase/migrations`.
4. Run `supabase/seed.sql`.

## 2) Vercel project setup

1. Import this repository in Vercel.
2. Ensure `vercel.json` is detected.
3. Configure environment variables for `Production`, `Preview`, and `Development`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SIGNED_URL_TTL_SECONDS` (optional, default 3600)
   - `FULL_YAML_TEXT_MAX` (optional, default 5000)
   - `GCAL_ICS_URL` (for cron sync)
   - `SYNC_CRON_TOKEN` (for cron endpoint authorization)

## 3) Security defaults

- Keep storage buckets private.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code.
- Access storage objects via Vercel API routes that mint signed URLs.

## 4) Runtime and dependencies

- Node runtime: `nodejs20.x`
- API functions are in `api/`
- Multipart handling uses `formidable`.
