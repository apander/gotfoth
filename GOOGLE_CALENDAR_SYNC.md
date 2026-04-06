# Google Calendar → Study Vault calendar sync

This repo includes `sync_google_ics.py`, which pulls your Google Calendar **private iCal feed** (no OAuth) and writes events into PocketBase **`settings`**. The Schedule view then shows those items as **dark grey chips** in each date cell and displays **last sync** time.

## Prerequisites

- Google Calendar: **Secret address in iCal format** for the calendar you want (Settings → Integrate calendar). Treat this URL like a password.
- PocketBase on your NAS, with a **`settings`** collection (see `schema-contract.md`). The script must be allowed to **list / create / update / delete** `settings` rows, or you must set **`PB_AUTH_TOKEN`** (admin or rule that can manage `settings`).
- **Python 3** on the machine that runs the job (typically the NAS over SSH).
- Python package **`requests`**:

```bash
python3 -m pip install --user requests
```

## Deploy from Windows (`deploy.ps1`)

From the repo folder:

```powershell
.\deploy.ps1
```

By default this copies:

| Purpose        | Destination on NAS (example)        |
|----------------|-------------------------------------|
| Web UI         | `\\<NAS>\gotfoth_data\pb_public\`    |
| `sync_google_ics.py` | `\\<NAS>\gotfoth_data\scripts\` (folder created if missing) |

Edit **`$nasIP`**, **`$nasPath`**, and **`$nasScriptsPath`** at the top of `deploy.ps1` if your share layout differs.

The sync script is **not** placed under `pb_public` so it is not served as a static file by your web stack.

## Environment variables

| Variable | Required | Default | Meaning |
|----------|----------|---------|--------|
| `GCAL_ICS_URL` | **Yes** | — | Google secret iCal URL |
| `PB_URL` | No | `http://mycloudex2ultra.local:8090` | PocketBase base URL |
| `PB_AUTH_TOKEN` | No | — | Bearer token if API rules require auth |
| `PB_SETTINGS_COLLECTION` | No | `settings` | Collection name |
| `GCAL_EVENT_KEY_PREFIX` | No | `gcal_evt_` | Prefix for per-event keys |
| `GCAL_SYNC_STATUS_KEY` | No | `gcal_sync_status` | Key for last-run metadata JSON |
| `GCAL_SYNC_PAST_DAYS` | No | `30` | Keep events from this many days ago |
| `GCAL_SYNC_FUTURE_DAYS` | No | `365` | Keep events up to this many days ahead |
| `SYNC_HTTP_TIMEOUT_SEC` | No | `20` | HTTP timeout for ICS + PocketBase |

## First run (SSH on NAS)

Adjust paths and URL:

```bash
export GCAL_ICS_URL='https://calendar.google.com/calendar/ical/.../basic.ics'
export PB_URL='http://mycloudex2ultra.local:8090'
python3 /path/on/nas/to/scripts/sync_google_ics.py
```

Expect console output like `Parsed … events` and `Done. created=…`. In PocketBase, open **`settings`**: you should see rows whose keys start with `gcal_evt_` plus one row **`gcal_sync_status`**. Reload the Study Vault **Schedule** page; the sync line above the calendar should update.

## Cron (WD My Cloud EX2 Ultra / Linux)

Example: every 15 minutes. Prefer a tiny shell wrapper so secrets are not in the process list longer than necessary:

1. Create `/shares/yourname/scripts/gcal_sync.env` (chmod `600`) with:

   ```bash
   export GCAL_ICS_URL='https://calendar.google.com/calendar/ical/.../basic.ics'
   export PB_URL='http://mycloudex2ultra.local:8090'
   # export PB_AUTH_TOKEN='...'   # if needed
   ```

2. Create `/shares/yourname/scripts/run_gcal_sync.sh`:

   ```bash
   #!/bin/sh
   . /shares/yourname/scripts/gcal_sync.env
   exec /usr/bin/python3 /shares/yourname/scripts/sync_google_ics.py
   ```

3. `chmod +x run_gcal_sync.sh`

4. Add to root crontab (`crontab -e`):

   ```text
   */15 * * * * /bin/sh /shares/yourname/scripts/run_gcal_sync.sh >> /tmp/gcal_sync.log 2>&1
   ```

Use the real path where `deploy.ps1` placed `sync_google_ics.py` (e.g. under `gotfoth_data/scripts/`).

## Troubleshooting

- **No chips / “not available yet”**: Confirm `loadSettings` runs (browser can reach `PB_URL`), cron ran successfully, and `gcal_sync_status` exists in PocketBase.
- **`requests` missing**: Install with pip as above.
- **403 / 401 from PocketBase**: Relax rules for `settings` or set `PB_AUTH_TOKEN`.
- **Stale data**: Shorten cron interval; Google’s feed can lag a few minutes.

## Security

- The Google **secret iCal URL** grants read access to that calendar to anyone who has the link. Do not commit it to git; use env files or NAS-only secrets with restrictive permissions.
