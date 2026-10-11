# GotFoth frontend

The v2 UI uses one shared visual system in `src/app/globals.css` and reusable primitives in `src/components/ui.tsx`. No framework, backend integration, schema, authentication or endpoint was replaced.

## Screen composition

- `vault.tsx`: identity and role-aware application shell. Home, Subjects, Practice and Progress are the student primary navigation; Plan remains secondary. Existing page query values are supported.
- `revision.tsx`: continuation-first Home, radio-based practice selection, subject switching and compact paper lists.
- `player.tsx`: source/question and answer columns, completion meter, explicit save status, question navigation and native modal submission review. Leaving through Back to study flushes saved work; sidebar navigation is disabled while an attempt is open.
- `views.tsx`: mark-weighted topic evidence, question-level lost marks, a single corrective-practice recommendation, parent review and planning.
- `schedule-fields.tsx`: ordinary form controls serialize to the existing enrolment schedule contract.
- `admin.tsx`: retained administrative actions using the shared form, list and surface styles.

## Design rules

Graphite typography, warm-white surfaces and one violet accent. Use rows for repeated content and surfaces for a coherent task, not one card per fact. All navigation icons share outlined SVG geometry. Controls have visible focus, 44px minimum primary targets, and reduced-motion support. Native dialogs trap focus, close with Escape and return focus to the triggering control. The existing app had no dark-theme infrastructure; this refactor maintains a coherent light theme.

Breakpoints are documented in the stylesheet. At compact widths primary navigation becomes a bottom bar; paper rows reflow; question columns stack; form controls remain full width. No hosted feature requires a local app server.

## Evidence boundaries

Only published assessments contribute scores. Home shows the latest reviewed result, not an invented mastery rating. Results rank marks lost per question without inventing per-topic allocations. Topic History keeps specification, assistance, exposure, submission dates and evidence counts. The current snapshot does not expose paper-to-attempt linkage, so the paper catalogue labels exposure but does not invent completion or past-paper scores. Draft start still requires the existing explicit cost authorisation; continuation opens an existing attempt directly.

## Verification

`npm run typecheck`, `npm test`, and `npm run test:browser` (with `TEST_BASE_URL` pointing to the hosted build). Browser scenarios use synthetic API responses and do not write learner data. `redesign.spec.ts` covers 375, 768, 1024 and 1440px student flows, answer saving, submission dialog keyboard behaviour, results, subject/topic navigation, and parent/admin screens. Screenshot evidence is written to ignored `test-results/`.
