# Vercel + Supabase Deploy and Cutover Checklist

This document is the migration-day runbook for moving from NAS/PocketBase to Vercel + Supabase.

## 0) Scope

- Frontend hosting: Vercel
- Backend/API: Vercel API routes
- Data store: Supabase Postgres + Storage
- Source migration: PocketBase on NAS

---

## 1) Variables and prerequisites

Run on your admin machine (PowerShell):

```powershell
$REPO="C:\Users\alasd\OneDrive\Documents\GitHub\gotfoth\gotfoth"
$PB_URL="http://mycloudex2ultra.local:8090"
$PB_AUTH_TOKEN=""  # optional
$SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
$APP_BASE_URL="https://YOUR_VERCEL_DOMAIN.vercel.app"
```

Confirm required files exist:

```powershell
cd $REPO
ls .\supabase\migrations\202604220001_initial_schema.sql
ls .\scripts\migrate_pocketbase_to_supabase.py
ls .\scripts\validate_supabase_parity.py
ls .\scripts\smoke_check_cloud.py
```

---

## 2) Backup and freeze prep

On NAS shell, create a pre-cutover backup:

```sh
tar -czf /mnt/HD/HD_a2/gotfoth_data/pb_data_backup_$(date +%F_%H%M).tgz /mnt/HD/HD_a2/gotfoth_data/pb_data
```

Record backup filename and size in your cutover notes.

---

## 3) Deploy script (schema + migration + parity)

### Step A: Apply Supabase schema

Apply:
- `supabase/migrations/202604220001_initial_schema.sql`
- `supabase/seed.sql`

Use Supabase SQL Editor or your preferred migration tool.

### Step B: Run migration

```powershell
cd $REPO
$env:PB_URL=$PB_URL
$env:PB_AUTH_TOKEN=$PB_AUTH_TOKEN
$env:SUPABASE_URL=$SUPABASE_URL
$env:SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
python .\scripts\migrate_pocketbase_to_supabase.py
```

### Step C: Run parity check

```powershell
cd $REPO
$env:PB_URL=$PB_URL
$env:PB_AUTH_TOKEN=$PB_AUTH_TOKEN
$env:SUPABASE_URL=$SUPABASE_URL
$env:SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
python .\scripts\validate_supabase_parity.py
```

Expected output:

- `papers: OK (...)`
- `boundaries: OK (...)`
- `settings: OK (...)`
- `Parity check passed.`

---

## 4) Vercel deploy and smoke test

Set Vercel project env vars for Preview + Production:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GCAL_ICS_URL`
- `SYNC_CRON_TOKEN`
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

1. Count parity (already covered by `validate_supabase_parity.py`)
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
7. Calendar/ICS:
   - run cron endpoint once and verify `gcal_sync_status` and `gcal_evt_*` keys update

### Optional: run cloud cron manually

```powershell
$token="YOUR_SYNC_CRON_TOKEN"
Invoke-RestMethod -Method Post -Headers @{Authorization="Bearer $token"} "$APP_BASE_URL/api/cron/sync-google-ics"
```

---

## 6) Cutover test matrix

Use this matrix as a sign-off sheet. Mark Pass/Fail with evidence links (screenshot/log URL).

| ID | Phase | Test | Command/Action | Expected Result | Pass/Fail | Evidence |
|---|---|---|---|---|---|---|
| M01 | Pre-cutover | NAS backup created | `tar -czf ...` | Archive created with non-zero size |  |  |
| M02 | Pre-cutover | Supabase migration applied | SQL apply | Tables + buckets exist |  |  |
| M03 | Migration | Full data migration | `python scripts/migrate_pocketbase_to_supabase.py` | Completes without exceptions |  |  |
| M04 | Migration | Count parity | `python scripts/validate_supabase_parity.py` | `Parity check passed` |  |  |
| M05 | Deploy | Production deploy | GitHub Actions workflow | Deploy succeeds |  |  |
| M06 | Deploy | API health | `GET /api/health` | `ok: true` |  |  |
| M07 | Functional | Paper upload flow | UI: upload paper/scheme/attempt | New record appears and status correct |  |  |
| M08 | Functional | Grade flow | UI: save YAML | Score + summary + status saved |  |  |
| M09 | Functional | View marking | UI: open feedback modal | YAML renders 3-depth view correctly |  |  |
| M10 | Functional | Signed file access | Open paper/scheme/attempt links | File opens via signed URL redirect |  |  |
| M11 | Functional | Long YAML overflow | Save > 5000 chars YAML | Save succeeds with file-based overflow |  |  |
| M12 | Calendar | ICS sync | Trigger cron endpoint | `gcal_evt_*` + `gcal_sync_status` updated |  |  |
| M13 | UX integrity | Backlog/Progress/Calendar | Browse app tabs | No runtime errors, expected data shown |  |  |
| M14 | Reconciliation | Status distribution | Compare old/new counts by status | Matches expected mapping (`Marked`/`Graded`) |  |  |
| M15 | Cutover | DNS/app switch | Open production URL | Users hit Vercel app successfully |  |  |
| M16 | Post-cutover | NAS writes disabled | Ops action | No further writes to PocketBase |  |  |

---

## 7) Final cutover steps

1. Confirm matrix rows M01–M15 are pass.
2. Announce cutover complete.
3. Disable NAS write path.
4. Retain NAS snapshot for rollback window.

---

## 8) Rollback plan

If critical defect is found:

1. Redeploy previous Vercel release.
2. Restore Supabase snapshot if data integrity is affected.
3. Re-enable NAS/PocketBase write path only after rollback confirmation.

Keep rollback evidence in the same matrix sheet (timestamp + operator).
