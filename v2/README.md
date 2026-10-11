# Study Vault v2

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

Sign in with the configured verified superuser account, create a family and learner, then issue a parent invitation and a student invitation. Copy each link to its intended recipient. A superuser has no implicit access to learner answers: join a family through an explicit parent membership to use its parent views. A second family is blocked until a successful restore test is recorded in Operations.

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
# Browser checks run against the Vercel deployment, not a local server.
npm run test:browser
```

GitHub Actions runs the database tests in an embedded Postgres engine. Those tests do not start a server. Application and operator connections must be Neon URLs; localhost is refused. The tests cover RLS under a restricted role, transaction-context reset, invitations and learner permissions, immutable submissions, duplicate submission protection, wallet reservations/caps/idempotency, marking checkpoints, privacy deletion and deadline snapshots. Domain tests cover marking evidence, optional routes, question selection, weighted topic history, retrieval scheduling, evaluation thresholds, and DST. Browser checks cover the invitation-only entry page, responsive layout, unauthorised private-file/cron requests and a synthetic student practice flow with mocked application responses. They do not replace live Google, Stripe, Neon, Blob, Workflow or Calendar integration tests.

## Operational completion before a family pilot

This is an implemented application baseline, **not an approved production launch**. In addition to the external credentials and catalogue, complete these items against the configured deployment:

- Exercise the complete authenticated student/parent workflow with real OAuth and reviewed papers; inspect permissions under the deployed pooled runtime role.
- Reconcile payment success, refund, dispute and reversal events in Stripe test mode; no live checkout until that is complete.
- Verify workflow crash recovery and operator usage reconciliation under forced interruption.
- Configure the protected `v2-production-maintenance` GitHub environment, its three secrets from `.github/workflows/v2-maintenance.yml`, and the `V2_MAINTENANCE_ENABLED` repository variable. The daily job encrypts and uploads a private backup, purges requested family records, and expires backups after 30 days. Run `scripts/backup.ts restore-test <downloaded-backup>` against an empty isolated `RESTORE_TEST_DATABASE_URL`; the command rejects nonempty targets. Record a successful real restore in Operations. Production backup and purge operation are not verified merely by the code tests.
- Evaluate model configurations using human-marked references and test provider failure/cost cases.
- Validate each imported full mock, including diagram resources and all optional routes.
- Recheck dependency advisories at deployment. The final installed dependency audit reported zero vulnerabilities after non-breaking fixes and overrides.

Parent review includes candidate selection, editable awarded marks, evidence and justification, and explicit resolution of invalid question choices without changing the original submission. Approved plans freeze an exact attempt; calendar links reopen that attempt. Retrieval scheduling is reproducible from published evidence and advances through 3, 7 and 21 days after successful independent retrieval, resetting after weak evidence. Refund and dispute reconciliation uses authoritative Stripe state and an idempotent ledger. These paths still require deployment integration and family-pilot acceptance checks before launch.

Marking commits a checkpoint after each question and required blind review. Workflow steps continue from the outbox without putting an entire paper in one server execution. Operators can recover failed or stale jobs. A provider request interrupted before its usage is saved is conservatively held for reconciliation; do not reset operator usage merely to bypass a spending limit.
