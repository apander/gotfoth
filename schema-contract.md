# PocketBase schema contract (Study Vault)

The database lives on the NAS; this file is the **source of truth** for the frontend. Update it when you change PocketBase Admin.

The UI loads as **classic scripts** (not ES modules) so it runs when you open `index.html` from disk (`file://`) as well as from a static host. PocketBase `fetch` calls still require your browser to reach the NAS URL in `js/config.js`.

## `papers`

| Field | Type | Notes |
|-------|------|--------|
| `subject` | select | e.g. `Psychology`, `Business Studies` |
| `year` | text | Exam cohort year (e.g. `2023`), stored as text in PocketBase — used for backlog grid and performance (P1/P2 pairing). |
| `paper_type` | select | Must match `boundaries.paper_key` (e.g. `Business P1`). The UI derives a display label: `{subject} Paper 1|2 {year}` via [`js/domain/paperMeta.js`](js/domain/paperMeta.js). |
| `status` | select | `Planned` → `Completed` → graded terminal state |
| `scheduled_date` | date | ISO with time. If omitted at deposit, the app sends `2099-12-31 …` as “not scheduled yet” until you set a real date in PocketBase. |
| `score` | number | 0–100 when graded |
| `max_score` | number | Optional |
| `file_paper`, `file_scheme`, `file_attempt` | file | |
| `file_marking_yaml` | file | Optional. When pasted YAML exceeds `full_yaml` max length (5000 chars in default rules), the app stores a short stub in `full_yaml` and uploads the full body here. Add this field in PocketBase Admin as **file**, not required. |
| `ai_summary` | text | From YAML `feedback_summary` |
| `full_yaml` | text | Raw marking YAML (or stub `_gotfoth_marking_yaml_storage: file` when overflow is in `file_marking_yaml`) |

### Status workflow

1. **Planned** — Paper + scheme deposited; no attempt (or no grading payload).
2. **Completed** — Attempt uploaded; awaiting **Log result**.
3. **Graded terminal state** — In PocketBase this may still be named **`Marked`**. The app sets `STATUS_GRADED` in [`js/config.js`](js/config.js) (default `Marked`). After you add **`Graded`** as an option and migrate rows, change that constant to `Graded`.

The app treats **`Marked` and `Graded` both as graded** for charts and heatmaps.

## `boundaries`

| Field | Role |
|-------|------|
| `paper_key` | Joins to `papers.paper_type` |
| `max_mark`, `a`…`e`, `a_star` | Raw mark thresholds |

## `settings`

| Field | Role |
|-------|------|
| `key` | e.g. `psy_p1_date`, `bus_p1_date` |
| `value` | DateTime |

Used for the Diary exam countdown strip (`EXAM_SETTING_KEYS` in `js/config.js`).

### Optional Google Calendar import keys

If you run `sync_google_ics.py`, it writes additional rows in `settings`:

- `key`: `gcal_evt_<hash>`
- `value`: JSON string, e.g. `{"date":"2026-04-07","label":"Business homework","uid":"..."}`.

The frontend calendar renders these as **dark-grey chips** inside date cells. This is a read-only import path from Google iCal feed URL (no OAuth).

It also writes:

- `key`: `gcal_sync_status`
- `value`: JSON string, e.g. `{"last_sync":"...","events_total":18,"events_in_window":9,"source":"google_ics"}`

The schedule calendar shows this as **Last Google sync** above the month grid.

## Cron sync script

`sync_google_ics.py` reads a Google Calendar iCal URL and upserts the above `gcal_evt_` keys.

### Required env var

- `GCAL_ICS_URL` = Google "Secret address in iCal format" URL

### Optional env vars

- `PB_URL` (default `http://mycloudex2ultra.local:8090`)
- `PB_SETTINGS_COLLECTION` (default `settings`)
- `PB_AUTH_TOKEN` (if your PocketBase rules require auth)
- `GCAL_EVENT_KEY_PREFIX` (default `gcal_evt_`)
- `GCAL_SYNC_PAST_DAYS` (default `30`)
- `GCAL_SYNC_FUTURE_DAYS` (default `365`)

### Example cron entry (every 15 minutes)

`*/15 * * * * /usr/bin/python /path/to/gotfoth/sync_google_ics.py >> /var/log/gcal_sync.log 2>&1`

The SPA **Exams** view can **PATCH** records (multipart; new files optional) and **DELETE** records when PocketBase API rules allow it.

## Verification

1. Deposit paper+scheme only → `Planned`.
2. Deposit with attempt → `Completed`.
3. Log result → terminal graded status + `full_yaml` + `ai_summary`.
4. Deposit with historic YAML → graded in one POST.
