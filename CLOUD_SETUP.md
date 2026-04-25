# Cloud Setup (Vercel + Neon + Vercel Blob)

## 1) Neon project setup

1. Create a Neon project/database.
2. Copy `NEON_DATABASE_URL` into local and Vercel env.
3. Apply schema and seed:
   - `node scripts/apply_neon_schema.js`
4. Keep Supabase credentials available during migration-only tasks.

## 2) Vercel Blob setup

1. Enable Blob in the Vercel project.
2. Add:
   - `BLOB_READ_WRITE_TOKEN`
   - optional `BLOB_PUBLIC_BASE_URL` (only needed when storing key-only paths)

## 3) Vercel project setup

1. Import this repository in Vercel.
2. Ensure `vercel.json` is detected.
3. Configure env vars for `Production`, `Preview`, and `Development`:
   - `DATA_BACKEND` (`supabase` during transition, then `neon`)
   - `FILE_BACKEND` (`supabase` during transition, then `blob`)
   - `NEON_DATABASE_URL`
   - `BLOB_READ_WRITE_TOKEN`
   - `SIGNED_URL_TTL_SECONDS` (optional, default 3600)
   - `FULL_YAML_TEXT_MAX` (optional, default 5000)
4. Transition-only vars:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

## 4) Security defaults

- Keep `NEON_DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` server-side only.
- Access files through `/api/files/papers/:id/:field` (no direct client write tokens).
- Preserve rollback by keeping `DATA_BACKEND`/`FILE_BACKEND` switchable.

## 5) Runtime and dependencies

- API functions are in `api/`.
- DB driver: `pg`.
- Blob client: `@vercel/blob`.
- Multipart handling: `formidable`.
