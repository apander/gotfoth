# PocketBase schema contract (Study Vault)

The database lives on the NAS; this file is the **source of truth** for the frontend. Update it when you change PocketBase Admin.

The UI loads as **classic scripts** (not ES modules) so it runs when you open `index.html` from disk (`file://`) as well as from a static host. PocketBase `fetch` calls still require your browser to reach the NAS URL in `js/config.js`.

## `papers`

| Field | Type | Notes |
|-------|------|--------|
| `paper_title` | text | Required for deposit |
| `subject` | select | e.g. `Psychology`, `Business Studies` |
| `paper_type` | select | Must match `boundaries.paper_key` (e.g. `Business P1`, not `Business Studies P1`) |
| `status` | select | `Planned` → `Completed` → graded terminal state |
| `scheduled_date` | date | ISO with time |
| `score` | number | 0–100 when graded |
| `max_score` | number | Optional |
| `file_paper`, `file_scheme`, `file_attempt` | file | |
| `ai_summary` | text | From YAML `feedback_summary` |
| `full_yaml` | text | Raw Gemini YAML |

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

Used for the dashboard exam countdown strip (`EXAM_SETTING_KEYS` in `js/config.js`).

## Verification

1. Deposit paper+scheme only → `Planned`.
2. Deposit with attempt → `Completed`.
3. Log result → terminal graded status + `full_yaml` + `ai_summary`.
4. Deposit with historic YAML → graded in one POST.
