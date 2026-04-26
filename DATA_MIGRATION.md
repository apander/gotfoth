# Neon Database Operations

## Scope

- Runtime stack is Neon Postgres + Vercel Blob only.
- Supported DB operations:
  - Promote dev -> prod
  - Refresh dev <- prod
  - Backup prod snapshot

## Required environment variables

- `DEV_NEON_DATABASE_URL`
- `PROD_NEON_DATABASE_URL`
- Optional:
  - `PG_BIN_DIR`
  - `BACKUP_DIR`

## Scripts

Apply schema and seed:

```bash
node scripts/apply_neon_schema.js
```

Backup production snapshot:

```bash
node scripts/backup_prod_snapshot.js
```

Promote dev database into production:

```bash
node scripts/promote_dev_to_prod.js
```

Refresh dev database from production:

```bash
node scripts/refresh_dev_from_prod.js
```

## Notes

- Promotion script always creates a prod pre-promotion backup before restore.
- Refresh script always creates a dev pre-refresh backup before restore.
- Dumps are written to `BACKUP_DIR` (default `./backups`).