# Data schema contract (Study Vault)

## Runtime target (Vercel + Neon + Vercel Blob)

- Frontend calls same-origin API routes under `/api/...`.
- Database system of record: Neon Postgres.
- File storage: Vercel Blob.
- Schema source: [`neon/migrations`](neon/migrations) + [`neon/seed.sql`](neon/seed.sql).

## Tables

### `papers`

| Field | Type | Notes |
|-------|------|-------|
| `id` | text | Primary key (uuid/text) |
| `subject` | text | `Psychology` or `Business Studies` |
| `year` | text | Exam cohort year |
| `paper_type` | text | e.g. `Psychology P1`, `Business P2` |
| `status` | text | `Planned`, `Completed`, `Marked` |
| `scheduled_date` | timestamp | Date/time used in calendar and schedule |
| `score` | numeric | Percentage score when graded |
| `max_score` | numeric | Optional |
| `file_paper` | text | Blob URL/key |
| `file_scheme` | text | Blob URL/key |
| `file_attempt` | text | Blob URL/key |
| `file_marking_yaml` | text | Blob URL/key for large YAML bodies |
| `full_yaml` | text | YAML text or storage stub |
| `ai_summary` | text | Feedback summary |

### `boundaries`

| Field | Type | Notes |
|-------|------|-------|
| `paper_key` | text | Joins to `papers.paper_type` |
| `max_mark`, `a`...`e`, `a_star` | numeric | Grade boundaries |

### `settings`

| Field | Type | Notes |
|-------|------|-------|
| `key` | text | e.g. `psy_p1_date`, `bus_p2_date` |
| `value` | text/timestamp | App settings values |

### `app_users`

| Field | Type | Notes |
|-------|------|-------|
| `id` | text | Primary key |
| `username` | text | Login username |
| `password_plaintext` | text | Stored plaintext per current auth model |
| `password_hash` | text | Legacy compatibility field |
| `is_active` | boolean | Active login flag |

### `app_sessions`

| Field | Type | Notes |
|-------|------|-------|
| `id` | text | Primary key |
| `user_id` | text | FK to `app_users.id` |
| `token_hash` | text | Server-side session token hash |
| `remember_me` | boolean | Session persistence flag |
| `expires_at` | timestamp | Session expiry |
| `revoked_at` | timestamp | Session revocation |

## Status flow

1. `Planned`: paper/scheme set, attempt pending.
2. `Completed`: attempt uploaded, not yet graded.
3. `Marked`: grading YAML saved, score present.

## Verification checklist

1. Create paper record (`Planned`).
2. Upload attempt and transition to `Completed`.
3. Save grading YAML and verify `Marked` with score/summary.
4. Open file routes for paper/scheme/attempt/marking YAML.
