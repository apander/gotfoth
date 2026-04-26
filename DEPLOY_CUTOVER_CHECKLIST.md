# Vercel + Neon + Vercel Blob Deploy and Cutover Checklist

## 0) Scope

- Frontend + API: Vercel
- Database: Neon Postgres
- File storage: Vercel Blob

---

## 1) Variables

```powershell
$REPO="C:\Users\alasd\OneDrive\Documents\GitHub\gotfoth\gotfoth"
$DEV_NEON_DATABASE_URL="postgresql://..."
$PROD_NEON_DATABASE_URL="postgresql://..."
$APP_BASE_URL="https://gotfoth.vercel.app"
```

Optional local variables:

```powershell
$PG_BIN_DIR="C:\Program Files\PostgreSQL\17\bin"
$BACKUP_DIR="$REPO\backups"
```

---

## 2) Pre-cutover backup

```powershell
cd $REPO
$env:PROD_NEON_DATABASE_URL=$PROD_NEON_DATABASE_URL
$env:PG_BIN_DIR=$PG_BIN_DIR
$env:BACKUP_DIR=$BACKUP_DIR
node .\scripts\backup_prod_snapshot.js
```

Record dump filename in cutover notes.

---

## 3) Promote dev -> prod

```powershell
cd $REPO
$env:DEV_NEON_DATABASE_URL=$DEV_NEON_DATABASE_URL
$env:PROD_NEON_DATABASE_URL=$PROD_NEON_DATABASE_URL
$env:PG_BIN_DIR=$PG_BIN_DIR
$env:BACKUP_DIR=$BACKUP_DIR
node .\scripts\promote_dev_to_prod.js
```

---

## 4) Deploy and smoke test

Ensure Vercel env:

- `DATA_BACKEND=neon`
- `FILE_BACKEND=blob`
- `NEON_DATABASE_URL=<prod>`
- `BLOB_READ_WRITE_TOKEN=<token>`

Deploy, then run:

```powershell
cd $REPO
$env:APP_BASE_URL=$APP_BASE_URL
node .\scripts\smoke_check_neon_blob.js
```

---

## 5) Manual validation

1. Login works.
2. Exams list loads.
3. Calendar loads and clicking marked paper opens feedback modal.
4. Open paper/scheme/attempt links through file API.
5. Save grade and reopen feedback modal.

---

## 6) Rollback

1. Re-deploy previous stable Vercel deployment.
2. Restore previous prod snapshot:

```powershell
& "$PG_BIN_DIR\pg_restore.exe" --dbname="$PROD_NEON_DATABASE_URL" --clean --if-exists --no-owner --no-privileges "<backup-file>.dump"
```

3. Run smoke check again.