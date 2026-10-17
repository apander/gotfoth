# Preview test workspaces

Open `https://gotfoth-persona-preview.vercel.app/testing` using the preview share link, enter the shared test password, and choose an account. Google is not involved in these fixture logins. The page lists every name, email, family and starting scenario.

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
4. Sign in as Taylor and try timed practice without credit. Switch to Pat, choose **Add €10 test credit**, then return to Taylor. Credit is fictional and uses the normal wallet/reservation records.
5. Sign in as Avery and use the workspace selector to switch between parent and teacher experiences.

The test tools banner links back to the account picker. **Run test processing** handles queued work only in the signed-in test account’s authorised fixture families, using the existing job and marking pipeline. Synthetic feedback is labelled, costs zero, and requires teacher publication. It does not assess learning. These fixtures do not exercise real Google, Stripe, Calendar, Blob or paid model integrations.

## Restore the starter data

From the `v2` directory, with the existing ignored preview operator configuration:

```powershell
npx --no-install tsx scripts/seed-test-workspaces.ts --apply --reset
```

Without `--apply`, the script only prints its plan. Re-running `--apply` without `--reset` adds missing fixtures without erasing test work. Reset targets only the four reserved fixture family IDs, removes their workflow data and test sessions, then restores the starter scenarios. It refuses fixture accounts linked to a non-fixture family. It preserves the original Anderson preview family and real Google accounts. Published assessment ledger entries are included in reset coverage.

## Boundaries and verification

Test sign-in requires the explicit flag `TEST_LOGIN_ENABLED=true`, `VERCEL_ENV=preview`, the exact persona-preview auth URL, the isolated `gotfoth_persona_preview` database, and requests to the stable preview host. Only the listed fixture emails can use password sign-in; email registration remains disabled. Test sessions use Better Auth and retain all existing server membership and learner checks. Test tooling rejects normal Google accounts and cannot act on other family IDs. Normal production authentication and marking remain governed by their existing configuration.

The standard browser suite remains fixture-based. To run the additional eight live tests, set `TEST_WORKSPACES_PASSWORD` from the ignored credentials file, `TEST_BASE_URL` to the stable preview, and `PLAYWRIGHT_STORAGE_STATE` to an authorised ignored preview browser-state file. Run `npm run test:browser -- tests/test-workspaces.spec.ts`, then reset the fixture data. These tests cover all 12 logins, real course setup, cross-family and role restrictions, bad passwords, disabled registration, idempotent test credit, submission, simulated processing, teacher publication and read-only parent access.
