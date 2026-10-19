# Mobile companion and desktop workspace

The same account, permissions and records support two deliberately different experiences. Phones and tablets use Companion; recognised computers use Desktop. Width controls layout within the selected experience. Device recognition is best effort and is not an access-control boundary. Narrowing a desktop window or enlarging text never replaces an active editor.

## Capability inventory

**Student companion:** Today, Diary, Progress, Subjects and Reminders. Read published feedback, submitted work and released sources; query a result; inspect subject/topic evidence and practice history; view/edit weekly goals; update taught topics, availability, blocked dates, preferred session length and confirmed exam dates; connect/reconnect/disconnect Google Calendar; add/approve/move/cancel individual study sessions; propose a week; read/snooze reminders; copy/share a computer continuation link. Desktop adds course/specification/option/extra-time setup and course deletion, paper browsing/release, practice selection, all answering modes, hints, review/submission, source tools, corrective retries and writing recovery. Mobile attempt summaries never read unseen questions, record exposure, acquire an editor or start a timer.

**Parent companion:** Overview, Progress, Funding and Reminders. Switch authorised children/families; read recent activity, subject/topic evidence, assessment history, published feedback, submitted answers, study plans and exams; inspect credit, reservations and transactions; purchase credit and explicitly save monthly limits; read funding/payment/progress reminders. Desktop adds denser family-wide investigation and family-data export/deletion. Parents cannot edit courses/plans, query results or publish reviews. Financial tasks stay with adults.

**Teacher companion:** Overview, Students, Groups and Reminders. Search/filter authorised students by family/subject/status/group; see old outstanding reviews, queries and processing blockers; read original submitted work, course context, published history, upcoming study, topic evidence and guidance; inspect saved groups and matched performance; continue a specific review on a computer. Desktop adds group management and complete rubric/candidate/decision review, publication, optional-choice resolution and permitted reprocessing. Groups are personal collections of existing authorised learners and grant no access or class-management powers.

**Administrator companion:** Status, Families, Queues and Reminders, with read-only family/member/access, invitation, content and processing summaries. Desktop provides family/member/invitation mutations, publication, rate/configuration changes, operational evidence and job recovery. Administration remains separate from explicit family memberships.

Both experiences retain normal sign-in, invitation acceptance, one-click fictional test accounts, account/profile/accessibility controls, workspace switching, sign-out and personal-account deletion. Desktop retains all companion capabilities. Computer links contain record identifiers, never credentials, and require the receiving user's own authorised sign-in.

## Diary and reminders

The diary supports day/week/agenda ranges and pagination. Study times use the course timezone, including DST. Individual sessions use an enrolled, taught topic and independent practice. Approval prepares a draft without starting it. Started/completed tests cannot be moved or cancelled through the diary; deadlines stay authoritative. Routine/topics/exam changes are focused patches under a row lock, rather than stale whole-course replacement.

In-app reminders derive from current authorised records. Read/snooze state belongs to the user and synchronises across sessions. Snoozing uses tomorrow in the chosen timezone without resolving the task. Students receive study/exam, corrective-practice, feedback and calendar-reconnection reminders. Parents additionally receive low-credit, funding/cap blockers and payment outcomes. Teachers receive reviews/queries, processing blockers and new published evidence. Administrators receive failed/stale jobs, expiring invitations and unpublished-content attention. Low available credit defaults to €5 and is parent-configurable.

Calendar publishing remains one-way. Approved sessions and confirmed date-only exams use stable event identities, cancellation/retries and optional reminder overrides: calendar defaults, 10/30/60 minutes, or Off. Preference changes and reconnects republish eligible records. Exam dates have no invented sitting time. There is no push, SMS or reminder-email delivery; the in-app inbox updates when opened/refreshed.

## Meaningful comparisons

Teacher comparisons use published results within a selected range (90 days by default), matching subject/specification, frozen question wording, rubrics, supporting sources, selected questions, mode, assistance and prior exposure. Each learner contributes their latest matching result, with their own previous matching result retained for change. Median/range require at least three learners. Missing/unmatched evidence, activity and topic coverage remain separate from attainment. No predicted grades or student-facing rankings are produced. Each read rechecks teaching membership.

## Interfaces and persistence

Migration `0007_companion` adds teacher-owned groups/members and user-owned reminder preferences/state with actor RLS, family cleanup and cascading account cleanup. Existing submissions are untouched.

New authenticated GET reads: `family/summary`, `family/diary`, `family/activity`, `family/attempt-summary`, `family/funding`, `teacher/groups`, `teacher/comparison`, `admin/companion`, `reminders`. Activity, diary, funding and operational lists are independently paginated. `teacher/workspace` accepts a group filter. New POST actions: `family/planning`, `family/plan/create`, `teacher/groups`, `reminders/action`, `reminders/preferences`. Existing domain actions continue to enforce funding, approval, queries and publication.

Experience/capability definitions live in `src/lib/experience.ts`; compatible URL resolution lives in `src/lib/navigation.ts`. Companion composition and scoped data reads are separate from desktop answer/review editors. Payment returns preserve family context.

## Verification and release

Run type checking, domain/database tests, production build and browser tests (`companion.spec.ts`, `redesign.spec.ts`, `browser.spec.ts`). Companion tests use actual phone/iPad identity signals; width-only regressions deliberately remain computer tests. Test long history, revoked access, small/mismatched samples, query-held results, reminder persistence, DST and calendar failure/retry without contacting real providers.

Apply the additive `0007_companion` migration using the existing owner migration command before deploying the updated main application. The new tables can remain if application code is rolled back. Verify authenticated fictional accounts on the main development site without resetting existing test work. Separate preview infrastructure is not required.

Local acceptance on 19 October 2026: type checking, production build, 45 domain/database tests and 66 browser cases passed. Calendar provider interactions use controlled mocks, including OAuth state, event identity, retry, cancellation and reconnect failures. Migration `0007_companion` was applied to main with normal-family inventory preserved and actor RLS checked through the restricted runtime.
