# Vercel + Neon + Vercel Blob Deploy and Cutover Checklist

This document is the migration-day runbook for moving from Supabase-backed runtime to Neon + Vercel Blob.

## 0) Scope

- Frontend hosting: Vercel
- Backend/API: Vercel API routes
- Data store: Neon Postgres + Vercel Blob
- Source migration: Supabase Postgres + Storage

---

## 1) Variables and prerequisites

Run on your admin machine (PowerShell):

```powershell
$REPO="C:\Users\alasd\OneDrive\Documents\GitHub\gotfoth\gotfoth"
$SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
$NEON_DATABASE_URL="postgresql://..."
$BLOB_READ_WRITE_TOKEN="vercel_blob_rw_token"
$APP_BASE_URL="https://YOUR_VERCEL_DOMAIN.vercel.app"
```

Confirm required files exist:

```powershell
cd $REPO
ls .\scripts\apply_neon_schema.js
ls .\scripts\migrate_supabase_to_neon.js
ls .\scripts\migrate_supabase_files_to_blob.js
ls .\scripts\validate_neon_parity.js
ls .\scripts\smoke_check_cloud.py
```

---

## 2) Backup and freeze prep

Create a Supabase snapshot/export before cutover:

```sh
# Run in Supabase dashboard or preferred backup tool before migration
```

Record backup filename and size in your cutover notes.

---

## 3) Deploy script (schema + migration + parity)

### Step A: Apply Neon schema

```powershell
cd $REPO
$env:NEON_DATABASE_URL=$NEON_DATABASE_URL
node .\scripts\apply_neon_schema.js
```

### Step B: Copy table data (Supabase -> Neon)

```powershell
cd $REPO
$env:SUPABASE_URL=$SUPABASE_URL
$env:SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
$env:NEON_DATABASE_URL=$NEON_DATABASE_URL
node .\scripts\migrate_supabase_to_neon.js
```

### Step C: Copy files (Supabase Storage -> Blob)

```powershell
cd $REPO
$env:SUPABASE_URL=$SUPABASE_URL
$env:SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
$env:NEON_DATABASE_URL=$NEON_DATABASE_URL
$env:BLOB_READ_WRITE_TOKEN=$BLOB_READ_WRITE_TOKEN
node .\scripts\migrate_supabase_files_to_blob.js
```

### Step D: Run parity check

```powershell
cd $REPO
$env:SUPABASE_URL=$SUPABASE_URL
$env:SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
$env:NEON_DATABASE_URL=$NEON_DATABASE_URL
node .\scripts\validate_neon_parity.js
```

Expected output:

- `papers: supabase=N neon=N OK`
- `boundaries: supabase=N neon=N OK`
- `settings: supabase=N neon=N OK`
- `Parity validation passed.`

---

## 4) Vercel deploy and smoke test

Set Vercel project env vars for Preview + Production:

- `DATA_BACKEND` (`neon`)
- `FILE_BACKEND` (`blob`)
- `NEON_DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN`
- `SIGNED_URL_TTL_SECONDS`
- `FULL_YAML_TEXT_MAX`

Trigger deploy (merge/push to `main`), then run smoke checks:

```powershell
cd $REPO
$env:APP_BASE_URL=$APP_BASE_URL
python .\scripts\smoke_check_cloud.py
```

---

## 5) Cutover reconciliation test script

Run this after production deploy and before announcing cutover complete.

### API health and list endpoints

```powershell
Invoke-RestMethod "$APP_BASE_URL/api/health"
Invoke-RestMethod "$APP_BASE_URL/api/collections/papers/records?perPage=5"
Invoke-RestMethod "$APP_BASE_URL/api/collections/boundaries/records"
Invoke-RestMethod "$APP_BASE_URL/api/collections/settings/records?perPage=5"
```

### Reconciliation checks (manual/scripted)

1. Count parity (already covered by `validate_neon_parity.js`)
2. Status distribution parity (Planned/Completed/Marked/Graded)
3. Score sanity:
   - count non-null scores matches expected graded papers
4. File path coverage:
   - sample 10 papers with each of:
     - `file_paper_path`
     - `file_scheme_path`
     - `file_attempt_path`
     - `file_marking_yaml_path`
5. Signed URL retrieval:
   - open at least one file in each class through `/api/files/papers/{id}/{field}`
6. YAML behavior:
   - normal YAML save
   - long YAML overflow save (over `FULL_YAML_TEXT_MAX`)
7. Provider flags:
   - verify runtime envs are `DATA_BACKEND=neon` and `FILE_BACKEND=blob`

---

## 6) Cutover test matrix

Use this matrix as a sign-off sheet. Mark Pass/Fail with evidence links (screenshot/log URL).

| ID | Phase | Test | Command/Action | Expected Result | Pass/Fail | Evidence |
|---|---|---|---|---|---|---|
| M01 | Pre-cutover | Supabase snapshot created | Dashboard/export task | Snapshot exists with timestamp |  |  |
| M02 | Pre-cutover | Neon schema applied | `node scripts/apply_neon_schema.js` | Tables exist in Neon |  |  |
| M03 | Migration | Table migration | `node scripts/migrate_supabase_to_neon.js` | Completes without exceptions |  |  |
| M04 | Migration | File migration | `node scripts/migrate_supabase_files_to_blob.js` | Files uploaded and paths updated |  |  |
| M05 | Deploy | Production deploy | GitHub Actions workflow | Deploy succeeds |  |  |
| M06 | Deploy | API health | `GET /api/health` | `ok: true` |  |  |
| M07 | Functional | Paper upload flow | UI: upload paper/scheme/attempt | New record appears and status correct |  |  |
| M08 | Functional | Grade flow | UI: save YAML | Score + summary + status saved |  |  |
| M09 | Functional | View marking | UI: open feedback modal | YAML renders 3-depth view correctly |  |  |
| M10 | Functional | Signed file access | Open paper/scheme/attempt links | File opens via signed URL redirect |  |  |
| M11 | Functional | Long YAML overflow | Save > 5000 chars YAML | Save succeeds with file-based overflow |  |  |
| M12 | Runtime | Provider switch | Set env flags and deploy | App serves from Neon + Blob |  |  |
| M13 | UX integrity | Backlog/Progress/Calendar | Browse app tabs | No runtime errors, expected data shown |  |  |
| M14 | Reconciliation | Status distribution | Compare old/new counts by status | Matches expected mapping (`Marked`/`Graded`) |  |  |
| M15 | Cutover | DNS/app switch | Open production URL | Users hit Vercel app successfully |  |  |
| M16 | Post-cutover | Supabase fallback retained | Ops action | Snapshot + env rollback path available |  |  |

---

## 7) Final cutover steps

1. Confirm matrix rows M01–M15 are pass.
2. Announce cutover complete.
3. Keep Supabase fallback snapshot for rollback window.
4. Document final provider flags in runbook notes.

---

## 8) Rollback plan

If critical defect is found:

1. Redeploy previous Vercel release.
2. Set `DATA_BACKEND=supabase` and `FILE_BACKEND=supabase` in Vercel env.
3. Redeploy previous stable version and confirm health checks.

Keep rollback evidence in the same matrix sheet (timestamp + operator).
