# Project Documentation: gotfoth. | Study Vault

## 1. Project Overview
**gotfoth. | Study Vault** is an educational dashboard for tracking AS-Level revision progress. It stores papers, mark schemes, attempts, and YAML-based marking feedback, then renders grading and performance views for students and teachers.

---

## 2. Infrastructure & Environment

- **Hosting:** Vercel (frontend + API routes)
- **Database:** Neon Postgres
- **File storage:** Vercel Blob
- **Runtime:** Node.js serverless functions

---

## 3. Functional Goals

- Centralize exam papers and attempts by subject/year/paper.
- Support YAML-driven grading workflow with score + summary + question-level feedback.
- Compute letter grades from boundaries.
- Provide calendar-based scheduling and performance analytics.

---

## 4. Technical Implementation

### Data Architecture

- `papers`: exam metadata, status, score, file links, YAML payload.
- `boundaries`: grade thresholds by `paper_key`.
- `settings`: app-level keys (including exam dates).
- `app_users` and `app_sessions`: simple login/session model.

### Frontend/Backend

- Vanilla JS frontend + Tailwind CSS.
- API routes under `/api/*`.
- DB adapter via `pg` and Neon connection string.
- File access via signed Blob-backed API routes.

### Workflow Sequence

1. Upload paper, mark scheme, and optional attempt.
2. Paste/attach grading YAML.
3. Save score/status/summary to `papers`.
4. Render calendar, backlog, and performance views with updated data.