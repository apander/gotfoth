# Test workspaces

Open `https://gotfoth.vercel.app/testing`, enter the shared test password, and choose an account. Google is not involved in these fixture logins. The page lists every name, email, family and starting scenario. The picker and test authentication are available on every deployment without an environment flag, hostname restriction or database-name restriction.

There are 12 accounts across four fictional families:

- River: students Alex and Jamie, parent Jordan, teacher Morgan; Avery also has parent membership.
- Hill: student Sam, parent Robin, teachers Morgan and Lee; Avery has teacher membership.
- Green: new student Casey, parent Chris and teacher Lee.
- Brook: student Taylor, parent Pat and teacher Lee. This family starts with no credit.

All account emails are `KEY@ux.gotfoth.test`, where KEY is the lower-case first name. The ignored `.vercel/persona-test-logins.json` file contains the shared password and account directory. Passwords are hashed in the authentication database; no password is included in browser JavaScript or tracked documentation.

## Useful journeys

1. Sign in as Alex, resume saved writing, take over editing, save and submit it. Select **Run test processing** after leaving the answer player.
2. Switch to Morgan, open Reviews, find the older Sam assessment, check its rubric and candidates, enter a reason and publish. Switch to Robin to read the published result.
3. Sign in as Casey and complete course setup before starting practice.
4. Sign in as Taylor, start timed practice without credit, and submit an answer. Feedback stays pending while the work waits for marking. Switch to Pat, choose **Add €10 test credit**, marking becomes eligible automatically, without Taylor resubmitting. Credit is fictional and uses the normal wallet/reservation records.
5. Sign in as Avery and use the workspace selector to switch between parent and teacher experiences.

The test tools banner links back to the account picker. **Run test processing** handles queued work only in the signed-in test account’s authorised fixture families, using the existing job and marking pipeline. Synthetic feedback is labelled, costs zero, and requires teacher publication. It does not assess learning. These fixtures do not exercise real Google, Stripe, Calendar, Blob or paid model integrations.

## Restore the starter data

From the `v2` directory, with the existing ignored main operator and runtime configuration:

```powershell
npx --no-install tsx scripts/seed-test-workspaces.ts --main --apply --reset
```

Without `--apply`, the script only prints its plan. Re-running `--apply` without `--reset` adds missing fixtures without erasing test work. Omit `--main` to use the existing preview configuration instead. Reset targets only the four reserved fixture family IDs, removes their workflow data and test sessions, then restores the starter scenarios. It refuses fixture accounts linked to a non-fixture family. It preserves other families and real Google accounts. Published assessment ledger entries are included in reset coverage. Seeding preserves existing active marking rates; the inactive simulator configuration is selected only for synthetic questions in the reserved test families. Synthetic papers are excluded from normal families' course and practice catalogues.

## Boundaries and verification

Test sign-in has no deployment guard. Only the listed fixture emails can use password sign-in; a correct password is required and email registration remains disabled. Test sessions use Better Auth and retain all existing server membership and learner checks. Test tooling rejects normal Google accounts, requires same-origin requests, and cannot act on other family IDs. Simulated marking costs zero and does not consume the paid AI budget. Normal accounts keep Google authentication and their configured marking rates.

The standard browser suite remains fixture-based. To run the live workflow tests, set `TEST_WORKSPACES_PASSWORD` from the ignored credentials file and `TEST_BASE_URL` to the deployment being tested. A protected preview may also need `PLAYWRIGHT_STORAGE_STATE`; main does not. Run `npm run test:browser -- tests/test-workspaces.spec.ts`. These tests cover all 12 logins, real course setup, cross-family and role restrictions, bad passwords, disabled registration, idempotent test credit, submission, simulated processing, teacher publication and read-only parent access. Reset only when the starter scenarios are needed again.


## Exam examples with supporting data

Enter the shared password and choose **Open exam example as Alex** in the account picker. This opens a new Psychology paper with a fictional study, a results table and four questions tied to that evidence. Signed-in students can also use **Open exam example** from the test tools banner. Sam’s Business subject also includes a separate fictional business extract with financial data. The examples are explicitly synthetic and use simulated marking. Previously saved attempts retain their original question content; they are not replaced or reset.
