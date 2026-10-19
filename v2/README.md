# GotFoth v2

The October 2026 mobile/desktop refactor is documented in [COMPANION.md](COMPANION.md). Phones and tablets use a dedicated companion; computers retain testing, assessment review and full monitoring. Apply `0007_companion` before deploying these screens. Current acceptance uses the main development site and fictional test families; historical preview instructions below describe earlier work.

The v2 application lives here independently of the original root application. No v1 code, database, or records are migrated. The approved product contract is [V2_SPEC.md](../V2_SPEC.md).

## Hosted application

Use https://gotfoth.vercel.app. Sign in with Google. No local application server is required.

Operator scripts read environment variables from the process. Never commit populated environment files.

## Database and deployment

1. Create separate preview and production Neon databases. Do not use either v1 connection string.
2. Set `DATABASE_ADMIN_URL` for the migration command only. Run `npm run db:migrate`. This refuses a database containing the v1 `papers` table. The reviewed SQL migration runs through Drizzle and includes relational constraints, immutable records, and RLS. `schema.ts` contains typed projections; generated projection-only migrations must not replace the reviewed full schema.
3. Run `scripts/runtime-role.sql` as owner and set its password securely. Use the restricted role in `DATABASE_URL`. Never use the owner connection in the deployed application.
4. Use the existing **gotfoth** Vercel project, root directory `v2`, framework Next.js. The legacy source and database are retained. Set the server-only variables from `.env.example` separately for preview and production. `SUPERUSER_EMAIL=alasdair.anderson@gmail.com` is read only by server code and is never a public variable.
5. Google redirect URIs: `/api/auth/callback/google` and `/api/calendar/callback` on each allowed origin. Sign-in and Calendar use separate consent flows. Calendar requests only `calendar.app.created`.
6. Create a private Vercel Blob store. Set `BLOB_READ_WRITE_TOKEN`. Generate `BETTER_AUTH_SECRET` and a base64-encoded 32-byte `TOKEN_ENCRYPTION_KEY` through your secret-management tools.
7. Configure Vercel Workflow. The Hobby-compatible cron runs daily; prompt background dispatch requires an external scheduler or a suitable Vercel plan. `npm run worker` runs one operator dispatch batch. The server checks the actual deadline on saves and reads even if a deadline job runs late.
8. Keep `PAYMENTS_ENABLED=false` until merchant settings, refund policy, webhook, reconciliation, and test-credit cleanup are complete. Stripe webhook URL is `/api/stripe`.

No live deployment, external account creation, or paid model call is performed by the implementation itself.

## First family

Sign in with the configured verified superuser account, create a family and learner, then issue a parent invitation and a student invitation. Copy each link to its intended recipient. A superuser has no implicit access to learner answers: join a family through an explicit parent membership to use its parent views.

Parents add each course’s specification identifier, taught topic identifiers, target session, Psychology option, time zone, allowance and availability. Topic identifiers must match the reviewed catalogue. Multiple parent invitations can link the same parent to additional learners without changing their existing role.

Configure a measured rate card in Operations. The card pins model IDs, prompt version, EUR input/output prices, answer/output limits and markup. Set `GLOBAL_AI_BUDGET_MICROS` to an explicit operator limit; zero disables provider work. A family’s default student cap is €10 monthly. Test credit can be granted by the superuser only while real payments are disabled.

## One-time importer

Download the supplied collection into a local folder. Do not store it under a public web directory.

```powershell
npm run import -- inventory C:\papers
npm run import -- extract C:\papers --cap-micros=20000000 --max-call-micros=1000000 --model=YOUR_REVIEWED_MODEL --input-rate=YOUR_EUR_RATE --output-rate=YOUR_EUR_RATE
npm run import -- validate C:\papers
npm run import -- stage C:\papers
npm run import -- report C:\papers
```

Rates are integer EUR micro-units per million tokens; €1 is 1,000,000 micro-units. The example caps are limits, not predicted costs. Choose a model that supports PDF input. Native PDF text is extracted first; original PDFs accompany paid extraction so scans and figures remain available to the model. Input tokens are counted before paid generation and the maximum output cost must fit both caps.

Checkpoints live in `<folder>/.import-cache`. Identical files are fingerprinted, extraction is cached by pair and configuration, and the report lists duplicates and unresolved documents. Correct ambiguous identities in `inventory.json` before extraction. A provider call interrupted after reservation leaves its operator budget reserved; reconcile it against provider usage before resuming. This deliberately avoids silently overspending after a crash.

Stage uploads private originals and creates unpublished versions. In Catalogue, compare extracted JSON with the source PDF, correct questions/resources/complete rubrics and optional groups, approve, then publish. Set full-mock eligibility only after reviewing every required response. Set distribution permission only after confirming rights. Published versions cannot be changed; an amended import needs a new UUID and version.

## Marking and evaluation

Submissions are frozen in a transaction and dispatched through the outbox. Blank responses are scored without a provider. Required independent reviews do not see the primary result. Disagreements, uncertainty and unevaluated configurations remain in the parent queue. Parents can publish complete rubric-supported results with a recorded reason; original candidates and submissions remain intact.

Create a held-out evaluation JSON matching `scripts/evaluate.ts`. It requires independently moderated work, confirmation of complete scripts, an unsupported-mark review, and a bias review. Run:

```powershell
npx tsx scripts/evaluate.ts reference.json
npx tsx scripts/evaluate.ts reference.json --approve
```

Only passing evaluations enable automatic release for that exact specification/configuration hash. Reference work is not supplied in this repository.

## Verification

```powershell
npm run typecheck
npm test
npm run build
# Set TEST_BASE_URL to the preview deployment or a local production build.
npm run test:browser
```

GitHub Actions runs the database tests in an embedded Postgres engine. Those tests do not start a server. Application and operator connections must be Neon URLs; localhost is refused. The tests cover RLS under a restricted role, transaction-context reset, invitations and learner permissions, immutable submissions, duplicate submission protection, wallet reservations/caps/idempotency, marking checkpoints, privacy deletion and deadline snapshots. Domain tests cover marking evidence, optional routes, question selection, weighted topic history, retrieval scheduling, evaluation thresholds, and DST. Browser checks cover the invitation-only entry page, responsive layout, unauthorised private-file/cron requests and a synthetic student practice flow with mocked application responses. They do not replace live Google, Stripe, Neon, Blob, Workflow or Calendar integration tests.

## Operational completion before a family pilot

This is an implemented application baseline, **not an approved production launch**. In addition to the external credentials and catalogue, complete these items against the configured deployment:

- Exercise the complete authenticated student/parent workflow with real OAuth and reviewed papers; inspect permissions under the deployed pooled runtime role.
- Reconcile payment success, refund, dispute and reversal events in Stripe test mode; no live checkout until that is complete.
- Verify workflow crash recovery and operator usage reconciliation under forced interruption.
- Configure the protected `v2-production-maintenance` GitHub environment, its three secrets from `.github/workflows/v2-maintenance.yml`, and the `V2_MAINTENANCE_ENABLED` repository variable. The daily job encrypts and uploads a private backup, purges requested family records, and expires backups after 30 days. Run `scripts/backup.ts restore-test <downloaded-backup>` against an empty isolated `RESTORE_TEST_DATABASE_URL`; the command rejects nonempty targets. Production backup and purge operation are not verified merely by the code tests.
- Evaluate model configurations using human-marked references and test provider failure/cost cases.
- Validate each imported full mock, including diagram resources and all optional routes.
- Recheck dependency advisories at deployment. The final installed dependency audit reported zero vulnerabilities after non-breaking fixes and overrides.

Teacher review includes candidate selection, editable awarded marks, evidence and justification, and explicit resolution of invalid question choices without changing the original submission. Approved plans freeze an exact attempt; calendar links reopen that attempt. Retrieval scheduling is reproducible from published evidence and advances through 3, 7 and 21 days after successful independent retrieval, resetting after weak evidence. Refund and dispute reconciliation uses authoritative Stripe state and an idempotent ledger. These paths still require deployment integration and family-pilot acceptance checks before launch.

Marking commits a checkpoint after each question and required blind review. Workflow steps continue from the outbox without putting an entire paper in one server execution. Operators can recover failed or stale jobs. A provider request interrupted before its usage is saved is conservatively held for reconciliation; do not reset operator usage merely to bypass a spending limit.

## Persona redesign (October 2026)

The four workspaces now have separate navigation and layouts. Students own course setup and planning; teachers review across their active family memberships; parents monitor and fund; superusers operate a separate administration context. See section 4 of V2_SPEC.md for the current UX contract.

Deploy the additive `0006_persona_goals` migration with the normal migration command before enabling the updated application against a database. It adds learner goal/timezone preferences and an assessment-queue index; it does not rewrite learning records. The UI remains compatible with old invitation, calendar, attempt and page links.

New authenticated endpoints: `GET teacher/workspace` (view, offset, family, learner, subject, status, search), `GET family/motivation` (family, learner), and `POST family/motivation` (familyId, learnerId, goal, timezone). Teacher reads use per-family RLS transactions and never return candidate answers in list summaries. Goals use authoritative submissions and count distinct completed attempts.

Run `npm run typecheck`, `npm test`, and `npm run build`. On Windows installations where Turbopack cannot start its CSS subprocess, `npm run build -- --webpack` verifies the same production application using the supported alternate compiler. Browser fixtures in `redesign.spec.ts` exercise all four personas at 375, 768, 1024 and 1440px and save visual references under `test-results`. Set `TEST_BASE_URL` to the preview URL and, if needed, `PLAYWRIGHT_EXECUTABLE_PATH` to an installed Chromium browser. Synthetic browser fixtures do not replace a real authenticated preview smoke test.

Release checklist: configure separate preview v2 database and OAuth settings, apply migrations there, exercise real role memberships and goal persistence, visually review the fixture screenshots, then run the migration and deploy in production. Do not reuse the legacy preview database or copy production credentials into preview. Rollback the application if needed; the additive columns can remain in place.

### Verification record — 16 October 2026

- Type checking passed; all 35 domain/database tests passed.
- The local production build passed with webpack; the Vercel preview production build passed with Turbopack.
- All 31 browser cases passed against the local production build (29 main cases plus 2 focused regression cases). Coverage includes four viewport widths, course setup, autosave and failed-save recovery, deadline freeze, review publication and queue context, mixed admin/member switching, parent read-only feedback, explicit funding-limit save, insufficient credit, goal reloads, enlarged text and keyboard drawer dismissal.
- Desktop and mobile synthetic screenshots were visually inspected. References are in `test-results/redesign-*.png`, including all persona landing screens, practice, feedback and teacher review.
- Preview deployment: https://gotfoth-aj0tewdth-apanders-projects-8cc2f736.vercel.app (ready). Deployment protection prevents unauthenticated browser automation; the preview environment also still needs separate v2 database and OAuth configuration. A real authenticated preview smoke test remains outstanding.
- No live database migration or production rollout was performed. Apply `0006_persona_goals` in the configured preview database before testing real learner goals.

### Isolated preview preparation

`scripts/prepare-persona-preview.ts` uses the existing ignored development and operator configuration, checks that their destination differs from production, and prints a read-only plan by default:

```powershell
npx --no-install tsx scripts/prepare-persona-preview.ts
```

After explicit approval for the external database and login creation, run the same command with `--apply`. It creates only `gotfoth_persona_preview` and the restricted `gotfoth_persona_preview_runtime` role on the development server, applies the current migrations, grants runtime access to the new database, and writes ignored `.env.persona-preview` / `.env.persona-preview-operator` files. It refuses mismatched targets and existing resources without matching local configuration. It does not alter Vercel settings or deploy automatically.

Configure the runtime values only for Preview branch `codex/persona-experiences`. Keep the owner connection out of Vercel. The proposed stable alias is `https://gotfoth-persona-preview.vercel.app`; its Google OAuth redirect URI is `https://gotfoth-persona-preview.vercel.app/api/auth/callback/google`. That URI must be registered on the existing Google client before real sign-in can complete. Preview protection also needs authorised test access or a normal Vercel browser sign-in.

### Hosted preview verification — 17 October 2026

The approved isolated database and restricted runtime role are provisioned, all seven migrations are applied, and the ten runtime variables are scoped only to Preview branch `codex/persona-experiences`. The owner connection is retained locally. The stable preview alias now points to deployment `dpl_7xEvBGBLWPxEcCczssTDnrF5QJeD`.

All 31 browser checks passed against `https://gotfoth-persona-preview.vercel.app` using the authorised Vercel protection session. Persona journeys use synthetic API fixtures; the live unauthenticated checks also verify the welcome page, private-file isolation and cron authentication. Playwright accepts `PLAYWRIGHT_STORAGE_STATE` for an ignored local browser-state file when a protected preview needs an authorised session.

Live `GET /api/v2/identity` returns `401 UNAUTHENTICATED`, and `GET /api/auth/get-session` returns a null session as expected. The live sign-in endpoint initiates Google OAuth successfully with the correct stable callback URL. The preview callback was subsequently registered on the Google OAuth client. A fresh browser check reaches the normal Google sign-in screen without `redirect_uri_mismatch`. Completing a real Google login and checking the resulting authenticated persona workspaces remain outstanding. No production migration or rollout has been performed.

The student/parent access follow-up found that the fresh preview database had no family or invitations, and the plain preview URL required Vercel membership. With explicit approval, an isolated preview family and seven-day email-bound student/parent invitations were created through the existing audited domain functions. A seven-day Vercel share link was created only for the stable preview alias; project-wide deployment protection remains enabled. Fresh browsers without Vercel sessions verified that both combined invitation/share links preserve the invitation, reach GotFoth, receive the expected unauthenticated API response, and open Google sign-in without an OAuth error. Users must complete Google sign-in with the invited address to accept their invitation. The private links and preparation scripts are retained only in ignored `.vercel` files.

### UX test accounts

The test account picker at `/testing` is available on main and other deployments, with twelve fictional students, parents, teachers and a mixed-role account across four families. Choose a person to sign in directly; no password or Google account is required. No preview, hostname, database-name or environment-flag guard applies. See [TEST_WORKSPACES.md](TEST_WORKSPACES.md) for scenarios, seeding, reset instructions and live workflow tests. Password sign-in and registration are disabled. Normal accounts retain Google sign-in; passwordless test sessions and test tools are restricted to the reserved fixture accounts and families. Test papers and simulated marking rates stay separate from normal families' content and paid processing.

### Guided student course setup

My subjects now uses subject cards and a three-step setup: course details, covered topics, and an optional study rhythm. The only available specification is preselected for confirmation. Weekly study times use day/time/duration fields with no drag grid or nested scrolling; exact saved minute values are preserved. Extra time, timezone and confirmed exam dates are disclosed on demand. Closing a changed draft asks before discarding, save errors retain choices, and dialog dismissal restores keyboard focus. Existing enrolment mutations and learning rules remain unchanged.


### Exam question workspace

The player uses an adjustable source reader beside a question and answer pane at 1024px and above. Source reading and answer writing scroll independently inside the available viewport; the question and save/submission controls remain available. Below 1024px, or when enlarged text leaves less than 64em of usable width, Source / Answer tabs preserve both places and keep the question accessible. Direct source tabs, inline zoom to 300%, printed images, text alternatives, image-load recovery and manual text highlighting support reference while writing. A pinned passage/table/figure opens as a quick-return tab in the same full reader, without a second scroll panel. Fit page measures both available dimensions and scales the complete source; Fit width keeps readable text and allows vertical scrolling. Tables and figures default to Fit page, prose to Fit width. Shared sources retain their reading position between subquestions, and each question remembers its selected source. Pane width, source positions/zoom, highlights, pin, current question and answer caret/scroll positions persist on the device, scoped to the signed-in user, family and attempt. A resumed guided attempt advances past remembered answers that have already been submitted. Corrupt or unavailable preference storage does not block opening practice. Annotations never become answer content or grading inputs. Original wording, marks and referenced material remain frozen, and unrelated material stays excluded. Timed sections and mocks disable browser spellcheck. Autosave, editor ownership, recovery, deadlines and submission rules are retained. Synthetic questions without supplied evidence do not acquire invented supporting material.
