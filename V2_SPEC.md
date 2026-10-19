# GotFoth v2 — Full consolidated plan

Version: 2.0  
Date: 3 October 2026  
Status: Approved specification baseline. Application implementation is in [v2](v2/README.md); its verification and production setup requirements are documented there. Local checks do not constitute family-pilot or production acceptance.

## Reading guide

- [Purpose and launch scope](#1-purpose-and-launch-scope)
- [Invitation-only access and family permissions](#2-invitation-only-access-and-family-permissions)
- [Curriculum and initial catalogue](#3-curriculum-and-initial-catalogue)
- [Student and parent experience](#4-student-and-parent-experience)
- [Practice progression](#5-practice-progression)
- [Answer player, autosave and timed behaviour](#6-answer-player-autosave-and-timed-behaviour)
- [One-time paper importer](#7-one-time-paper-importer)
- [Marking and teacher review](#8-marking-and-teacher-review)
- [Feedback and syllabus-topic history](#9-feedback-and-syllabus-topic-history)
- [Study planning and Google Calendar](#10-study-planning-and-google-calendar)
- [Credit, payments and processing costs](#11-credit-payments-and-processing-costs)
- [Architecture and data model](#12-architecture-and-data-model)
- [Interfaces and lifecycle](#13-interfaces-and-lifecycle)
- [Privacy, reliability and administration](#14-privacy-reliability-and-administration)
- [Delivery stages](#15-delivery-stages)
- [Acceptance tests](#16-acceptance-tests)
- [Deferred work and remaining launch inputs](#17-deferred-work-and-remaining-launch-inputs)

## 1. Purpose and launch scope

GotFoth v2 helps students build confidence and exam readiness through a progression from individual syllabus questions to complete past papers under timed conditions.

The central learning cycle is:

**Choose a task → answer in the app → receive checked feedback → practise an improvement → demonstrate it independently later.**

The first release will support:

- Invited families, each with a private workspace.
- Pearson Edexcel International A Level Psychology and Business.
- Typed answers within the app.
- Guided questions, independent question sets, timed sections and full-paper mocks.
- A one-time import of the supplied paper and mark-scheme collection.
- Automated marking with independent checking and a teacher exception queue.
- Supportive feedback, syllabus-topic history and progress dashboards.
- Parent-funded prepaid credit.
- Study planning and optional Google Calendar publishing.

**V2 starts with new accounts and student records. There is no v1 data migration in this release.** A limited historical-data migration may be specified separately later. The existing application and its data are not deleted or altered as part of this plan.

The application supports revision and timed practice. It does not claim to provide accredited examinations, secure remote invigilation or guaranteed grade predictions.

## 2. Invitation-only access and family permissions

### Superuser

Configure the following **server-only Vercel environment variable**:

`SUPERUSER_EMAIL=alasdair.anderson@gmail.com`

Do not use a `NEXT_PUBLIC_` prefix, embed the configured value in browser code, or let clients assign administrative privileges.

After Google authentication, the server checks the provider-verified email against this setting. Use Google’s stable account identifier for the stored account identity.

The configured superuser:

- Can sign in without an invitation.
- Creates family workspaces.
- Issues and revokes invitations.
- Assigns parent, teacher or student membership through invitations.
- Administers catalogue import and publication.
- Manages operational settings and processing failures.
- Can suspend access, with an audit record.

Only the superuser can issue invitations. Parents cannot invite additional users.

Superuser permissions are checked server-side on every privileged operation, rather than trusted from a browser or permanent role flag. A configuration change removes the previous account’s superuser authority. Missing or invalid configuration fails closed for administrative access.

### Invitations

Each invitation identifies:

- Recipient email.
- Family workspace.
- Parent, teacher or student role.
- Linked learner where applicable.
- Expiry and acceptance status.

Invitations are single-use, expire after seven days and can be revoked. Acceptance requires Google authentication with the matching verified email.

The initial implementation provides a copyable invitation link for the superuser to share. An email-delivery service is not required for launch.

Uninvited users cannot provision an application account or enter a family workspace. Previously admitted, active users can return through Google login without another invitation.

### Family roles

**Parents** monitor published results and study activity, fund the family wallet, and set monthly learner limits. Assessment views are read-only. Authorised family data export and deletion live in family settings.

**Teachers** review assessments and student queries, publish rubric-supported decisions, and use existing evidence to guide students. Their overview, roster and review queue aggregate only families where they have active teacher membership. They do not manage funding or student courses.

**Students** manage their own courses, taught topics, availability, exam dates and study plans, and can access their own answers, assessments, progress and assigned catalogue content. They cannot access siblings’ work, purchase credit, change budgets or grant membership.

A user may belong to multiple workspaces, with an explicit workspace switcher. Every private record, file and background job checks workspace membership and learner permissions.

Google Calendar access is optional and requested separately from Google login.

## 3. Curriculum and initial catalogue

The initial qualifications are:

- **Psychology:** Pearson IAL YPS01.
- **Business:** Pearson IAL YBS11.

Prioritise the IA2 units:

- Psychology WPS03/01: Applications of psychology.
- Psychology WPS04/01: Clinical psychology and psychological skills.
- Business WBS13/01: Business decisions and strategy.
- Business WBS14/01: Global business.

Retain IAS questions in the catalogue for prerequisite revision.

The published specifications identify Psychology Unit 3 as 64 marks/90 minutes and Unit 4 as 96 marks/120 minutes. Business Units 3 and 4 are each 80 marks/120 minutes. Store versioned defaults and verify the instructions on every imported paper. [Psychology specification](https://qualifications.pearson.com/content/dam/pdf/International%20Advanced%20Level/psychology/2015/specification-and-sample-assessments/ial-psychology-specification-assessment-jan-2026.pdf), [Business specification](https://qualifications.pearson.com/content/dam/pdf/International%20Advanced%20Level/Business/2018/Specification-and-Sample-Assessment/International-A-Level-Business-Spec.pdf)

Course enrolment records:

- Qualification, subject and specification version.
- Target examination session.
- Topics already taught.
- Optional syllabus choices.
- Weekly study availability and preferred session length.
- Time zone and any configured extra-time allowance.

Require the Psychology Unit 3 choice—criminological or health psychology—before automatically assigning questions from that optional section.

Do not assume that old papers perfectly match the current specification. Preserve their original wording and mark schemes, and explicitly map their suitability for current-course practice.

Exact examination dates are entered and confirmed by the student.

## 4. Four persona experiences

Student navigation: **Today · My subjects · Practice · Progress · My week**. Past papers sit inside Practice and each subject. Today prioritises an unfinished attempt, then an approved planned session, then a short practice. Course setup stays actionable before any course exists.

Teacher navigation: **Overview · Students · Reviews**. The teacher workspace combines authorised families with family, student, subject and status filters. Pending reviews remain discoverable even when the learner has a newer result. Funding and processing blockers are separate from teacher decisions. Review shows the original answer, rubric, candidates and editable decision together.

Parent navigation: **Overview · Progress · Funding**. Show recent activity, upcoming approved sessions and published feedback. Missing evidence is not a poor score. Funding shows available balance, reservations, transaction history and explicitly saved monthly limits. No assessment-query, course-editing or marking decisions are exposed to parents.

Superuser navigation: **Overview · Families · Invitations · Content · Operations**. Content groups paper browsing and catalogue publication. Administration is a separate context from explicit family memberships; switching never impersonates another person.

One component system supports four distinct compositions: red, white and navy student learning suited to A-level study, warm amber parent summaries, restrained teal teaching, and charcoal administration. The book companion appears only in student welcome, goals and completion states. Colour is never the only indication of role, status or performance.

Student motivation defaults to three sessions per Monday–Sunday week, configurable from one to seven in a saved IANA timezone (initially UTC, visible and editable). A completed attempt counts once when the attempt is submitted and at least one submitted answer contains content. Multiple guided question submissions, empty table cells, marking state and payment state do not inflate or suppress the count. Completion milestones at 1, 5 and 10 sessions celebrate participation, not mastery. A brief celebration appears after a successful submission and is remembered per learner/attempt on the device. No daily streak, XP or leaderboard.

Page, workspace, selected student/course, review filters and assessment links are URL-backed. Preserve old invitation, calendar and attempt links. Users with multiple memberships have a context switcher. Browser navigation out of an answer player flushes writing first and stays on the attempt if saving fails.

At widths below 640px, students use five-item bottom navigation; adults use a modal navigation drawer. The focused answer player uses independently scrolling source and answer panes from 1024px, and Source / Answer views below that width. Preserve keyboard navigation, focus restoration, save announcements, adjustable text, reduced motion, sufficient contrast and 44px primary controls.

## 5. Practice progression

Use one answer player with four modes.

### Guided practice

Default suggestion: roughly ten minutes, usually several short questions or one extended response.

- Select from topics already taught.
- Offer approved hints on request.
- Mark after explicit submission of each answer.
- Show feedback and offer a separate assisted retry.
- Allow pausing and resuming.
- Preserve the original submitted answer.

### Independent practice

Default suggestion: roughly twenty minutes.

- Mix eligible questions across relevant topics.
- Allow edits until the set is submitted.
- Hide hints, model answers and marking feedback until submission.
- Offer an optional elapsed-time display without enforcing a deadline.

### Timed sections

Use a coherent section, essay or selected set.

- Display and enforce the agreed duration.
- Preserve relevant sources and question-choice rules.
- Hide assistance and marking feedback during the session.
- Mark after submission.

For custom sets, estimate duration from the approved paper’s time-to-mark ratio and label it as an estimate.

### Full-paper mocks

- Preserve the paper’s original order, sections, instructions and choices.
- Include all required source material.
- Use the approved duration and any preconfigured allowance.
- Disable in-app hints and feedback until the attempt ends.
- Distinguish unseen papers from previously practised papers.

Do not omit unsupported questions and label the remainder a complete mock.

Students can choose any available mode. Progression is recommended, not enforced through arbitrary levels.

### Question selection and unseen papers

Use deterministic selection initially, without an LLM choosing every task.

Filter by:

- Enrolled course and compatible specification.
- Taught topics and selected syllabus options.
- Published status.
- Supported answer format.
- Question dependencies and required source material.

For recommended mixed sets, initially target approximately:

- 60% of available marks at identified gaps.
- 20% at scheduled review.
- 20% at other taught material.

These are configurable product defaults. Fill unavailable categories from other eligible taught content.

Avoid recently answered questions unless the task is a correction or planned retest.

Reserve the two most recent complete, compatible papers per unit for unseen mocks by default. Exclude their questions from ordinary practice selection. Students may release a reserved paper with an exposure warning.

Record exposure across the application. Opening a complete paper or mark scheme counts as exposure to the questions it discloses.

## 6. Answer player, autosave and timed behaviour

### Answer interface

Present a viewport-height exam desk from 1024px: an independently scrolling source reader on the left and the original question, number and marks above the answer editor on the right. The default 50:50 split adjusts between 35:65 and 65:35 with a pointer or keyboard; Enter or double-click resets it. The editor scrolls internally while save status and submission controls remain available. Long questions have a scrollable, expandable question area.

Cited extracts, figures, tables and supporting text are available through labelled source tabs. Preserve their original content; use printed figures where supplied, with inline magnification up to 300%, accessible text alternatives and image-load retry/fallback. Fit page scales the complete displayed source to both available dimensions and recalculates after resizing; Fit width reflows at readable text size and permits vertical scrolling. Tables and printed figures default to Fit page, prose to Fit width. Students can highlight selectable text and pin one passage, table or figure as a quick-return tab in the same full reader, with a link back to its context. Pinning never duplicates content in a capped panel or adds a second vertical scrollbar. An image-only source supports figure pinning and transcript highlighting where a transcript exists. No automatic evidence selection, summaries, drawing or margin notes.

Below 1024px, or when enlarged text leaves less than 64em of usable width, use keyboard-accessible Source / Answer tabs, keeping the question accessible in either view. Preserve reading and writing positions when switching views or related subquestions, and remember the selected source per question. Persist the selected question/source, pane width, source scroll/zoom, highlights, pin and answer caret/scroll locally per signed-in user, family and attempt. Resume guided work at an unsubmitted question when the remembered answer has already been submitted. These optional preferences must not block practice if storage is unavailable or invalid. Pins appear only when their source belongs to the current question. Annotations are separate from submitted answers and marking inputs; they do not change frozen content or timed-mode assistance rules. Do not fabricate evidence for standalone questions. Disable browser spellcheck in timed sections and mocks.

Include:

- Question numbering and marks.
- Question navigation.
- Answered, blank and flagged states.
- Visible save status.
- Timer where applicable.
- A submission review screen.

Support typed essays, short answers, numbers, units, calculations, basic symbols and editable tables.

Questions requiring unsupported graphical responses are flagged during import. Required unsupported responses block publication of that paper as a faithful full mock.

Do not preload hidden mark schemes or model answers into the browser and merely conceal them visually. Their API and file access must enforce release rules.

### Autosave

- Save after one second of inactivity, at least every five seconds during continuous typing, and on navigation.
- Maintain a local recovery draft and server copy.
- Show “Saved to account” only after server acknowledgement.
- Use revision numbers to prevent stale updates overwriting newer answers.
- Permit one active editor per attempt; another device must explicitly take over.
- Preserve recoverable text when a conflict occurs.

Clear local recovery copies after confirmed submission or explicit discard. Warn about unsynced work before clearing it on sign-out.

### Timing and submission

Store the start and deadline on the server. Refreshing, changing the device clock or closing the tab does not extend the deadline.

Mock mode does not pause. A learner may abandon it and continue separately as practice.

At the deadline:

- Freeze the last server-acknowledged answers and saved question choices.
- Create one immutable submission.
- Record that the attempt ended by expiry.
- Start or queue marking under the accepted cost authorisation.

Manual submission and expiry racing each other must resolve to the same submission.

Unsynced writing recovered later remains available as a separate interrupted practice revision. It cannot silently change the on-time mock result or trigger a new charge.

If an invalid option selection prevents correct scoring, preserve the work and hold it for resolution rather than automatically choosing the highest-scoring route.

## 7. One-time paper importer

### Operating model

A local command-line importer processes a downloaded folder containing the supplied PDFs.

There is no shared-drive API connection, watcher, scheduled synchronisation or automatic scraping.

The stages are:

**Inventory → extract → validate → review → publish → report**

Each stage saves checkpoints and supports safe resumption.

### Inventory

For every file, record:

- Original filename and relative path.
- SHA-256 fingerprint.
- Page count and document type.
- Subject, qualification, unit, year, session and variant.
- Matching paper, scheme and optional examiner report.

Use filenames and document text before involving an LLM in ambiguous identification.

Deduplicate identical files. Flag conflicting identities, missing schemes, unreadable files and incomplete pairings.

### Extraction

Read native PDF text first. Use page images where scans, diagrams or layouts require visual interpretation.

Create structured records for:

- Paper identity, timing, instructions and permitted materials.
- Sections and optional-question rules.
- Question groups and scored subparts.
- Case studies, figures, tables and other shared resources.
- Complete relevant marking rubrics.
- Syllabus topics, command words and assessment objectives.
- Original page references.

Preserve exact assessed wording. Hints and explanations are separate, labelled derivatives.

Keep levels-based marking rubrics intact. Do not turn an essay rubric into an invented keyword checklist.

### Validation and approval

Check:

- Required questions and resources are present.
- Each scored response has the correct rubric.
- Question numbering and subparts are complete.
- Mark totals reconcile for every permitted answer route.
- Parent questions and subparts are not double-counted.
- Paper and scheme identities match.
- Typed-answer compatibility is explicit.

An admin review screen displays extracted content beside the original pages. Every paper receives a recorded approval before publication.

Question-bank eligibility and full-mock eligibility are separate.

### Publication and cost

Publish immutable content versions atomically. Existing attempts retain the exact versions they used.

Cache extraction results by file fingerprint and processing configuration. Retry only failed stages or affected questions.

Require a batch cost cap before paid extraction. Catalogue preparation is an operator expense, not a student wallet charge.

The final report lists imported papers, duplicates, eligible questions, incomplete papers, unresolved issues and processing cost.

The operator must confirm permission for the intended shared catalogue use before distribution. Pearson’s published reproduction permissions are conditional. [Pearson copyright policy](https://qualifications.pearson.com/en/support/support-topics/exams/past-papers/pearson-copyright-policy.html)

## 8. Marking and teacher review

### Marking inputs

Mark an immutable submitted answer against its approved question and rubric version.

Provide the marker with:

- The answer.
- The exact question.
- Necessary source material.
- Relevant general and question-specific marking instructions.
- Subject-specific assessment guidance.

Do not provide prior student scores or a desired grade.

### Result format

Use validated, versioned JSON internally. Store:

- Answer, question and rubric version identifiers.
- Awarded and available marks.
- Rubric references and supporting answer evidence.
- A concise justification.
- Topic and exam-technique feedback.
- Uncertainty flags.
- Model, prompt and processing provenance.

Application code calculates totals and percentages. Model-generated aggregate arithmetic is not authoritative.

### Processing flow

1. Validate the submission and question choices.
2. Reserve permitted processing credit.
3. Run the primary marker.
4. Validate returned marks, evidence and coverage.
5. Obtain an independent review where required.
6. Publish or hold for teacher review.
7. Generate the concise feedback presentation and proposed corrective task.

Blank submitted answers can receive zero. Processing failures, missing rubrics and unsupported inputs cannot.

### Initial independent-review policy

Review:

- Levels-based extended responses worth eight or more marks.
- Responses with interpretation or evidence uncertainty.
- A deterministic 10% sample of other nonblank model-marked responses.
- Boundary-sensitive results when exact applicable grade boundaries are available.

The reviewer marks independently before seeing the first result.

During the pilot, score disagreements or unresolved rubric conflicts go to the teacher. Do not automatically average the marks or choose the higher result.

Use bounded retries and one targeted repair for malformed output. Avoid unlimited model adjudication loops.

### Teacher review

Show the answer, original question, rubric and competing marking explanations.

The teacher can:

- Accept a supported assessment.
- Make a rubric-supported correction with a reason.
- Request controlled reprocessing.
- Mark the result unresolvable.

Preserve original candidate marks and all decisions. Teachers cannot edit the student’s original submission.

Students can query a result through this review flow.

### Validation before automatic release

Automatic release starts disabled for each course until its configuration passes evaluation.

Use independently human-marked reference work covering both units and the relevant question types. Keep evaluation examples separate from prompt-development examples.

Initial pilot targets:

- At least 100 scored response groups from at least ten complete scripts per subject.
- At least 95% of response scores within the greater of one mark or 10% of available marks of the agreed reference.
- Mean absolute full-paper error no more than five percentage points.
- No full-paper error above ten percentage points.
- Manual inspection for unsupported marks and systematic over- or under-marking.

These are proposed product acceptance thresholds, not proof of examiner-equivalent accuracy.

Select the lowest measured-cost configuration that passes. If none passes, retain human approval for the affected material.

Re-evaluate meaningful changes to models, prompts, rubrics or routing rules.

## 9. Feedback and syllabus-topic history

### Positive reinforcement

Lead with up to two specific achievements and one manageable improvement.

Keep distinct:

- Original independent performance.
- Rubric-supported moderation.
- Assisted corrections.
- Later independent retests.

Do not fabricate praise or inflate attainment scores. Celebrate demonstrated improvements, successful corrections and later retention.

Small selected sets show marks and skill feedback, not extrapolated A-level grades.

A full-paper practice grade requires exact applicable boundary data. Overall qualification predictions and UMS/A* aggregation are outside the initial release.

### Topic History

Under **Progress → Topic History**, students and authorised parents select:

- Subject.
- Syllabus topic or subtopic.
- Date range.
- Practice mode and assistance conditions.

Default to the current specification, the last 90 days and independent attempts.

Show:

- A chronological performance chart.
- An accessible attempt list.
- Date, question, marks earned/available and attempt conditions.
- Feedback and links to the original answer.
- Whether the question was previously seen.
- A “Practise this topic” action.

Use submission dates, not planned dates or marking completion dates.

For each session/topic aggregate, calculate:

**Total awarded marks ÷ total available marks**

Display the number of assessed questions and available marks behind the percentage.

Only include published assessments. Exclude unresolved and failed marking.

For mixed-topic questions, show mixed-topic evidence unless the rubric supports separate allocation of marks. Do not invent topic-specific scores or double-count questions when rolling subtopics into a parent topic.

Store syllabus mappings by version. Do not silently combine incompatible specifications.

Moderation changes the effective mark at the original attempt date, while retaining the original assessment and correction in the audit history.

Show changes descriptively. Different question sets are not automatically equally difficult, and a small sample is not a reliable mastery estimate.

### Corrective practice

Suggest a short task following feedback, then independent retrieval at default intervals of three, seven and twenty-one days where results support progression.

Use approved catalogue questions. Novel AI-generated assessed questions are deferred until a separate review process exists.

Topic history and dashboard calculations use stored records and ordinary code, not additional LLM calls.

## 10. Study planning and Google Calendar

Store planned sessions separately from attempts. Rescheduling cannot change when completed work actually occurred.

Build a proposed weekly plan from:

- Entered availability and blocked periods.
- Exam dates.
- Due reviews.
- Topic gaps.
- Requested papers and preferred session lengths.

The student approves the plan. Each entry includes duration, purpose and a link to the exact task.

Missed work is offered for rescheduling without creating an ever-growing overdue backlog.

For Google Calendar:

- Request permission separately from sign-in.
- Create a dedicated GotFoth calendar.
- Publish approved sessions.
- Update or cancel only the app’s own events.
- Keep the app as the source of truth.
- Exclude scores and sensitive feedback from event descriptions.
- Use stable event mappings and idempotent jobs.
- Preserve the in-app plan if authorisation expires or Calendar is unavailable.

Direct changes in Google Calendar do not update the app in this release. Show a reconnect or republish action when needed.

Google provides an app-created-calendar scope suited to this limited integration. [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth)

## 11. Credit, payments and processing costs

Use one prepaid EUR funding account per family.

Initial defaults:

- €10 and €25 credit purchases.
- €10 monthly AI spending cap per student.
- Parent-controlled cap changes.
- No subscription or automatic top-up.
- Buying credit does not automatically increase the student’s cap.

The €10 target excludes hosting, payment fees and catalogue preparation. Actual paper throughput must be measured.

### Charging

Before paid processing:

- Obtain a server-issued cost quote.
- Show maximum marking costs and funding actions to parents, never to students.
- Reserve funds against both available family credit and the student’s remaining cap.
- Pin the rate card and marking configuration.

For every practice mode, freeze a bounded quote internally when the student selects Start practice. Reserve funds when available within the parent-controlled balance and cap. Lack of credit or remaining cap must not prevent writing, start a payment conversation with the student, or block deadline submission. Unfunded submissions wait safely for marking, with neutral Feedback pending wording for students. Parents see low-balance and awaiting-funding actions; adding credit or adjusting a cap resumes eligible marking automatically. No paid provider call is allowed without a valid reservation.

Insufficient funds must preserve the submitted work and place marking in an awaiting-funds state. Never discard an answer or reduce marking quality silently.

Settle actual authorised usage once a result is published and release unused reservations. Platform failures and internal retries do not create extra student charges.

Maintain an append-only ledger and use integer monetary units internally.

### Payments

Use hosted Stripe Checkout. Verify webhook signatures, payment status, amount, currency and family association server-side.

Repeated or out-of-order notifications cannot grant duplicate credit. A browser success redirect alone cannot credit the account.

Refunds and reversals remain auditable. A funding deficit pauses new paid work without deleting existing results.

Merchant configuration, applicable charges, the rate card and refund policy must be completed before real-money checkout is enabled.

### Cost controls

- Reuse catalogue extraction.
- Retrieve exact question context.
- Mark only submitted work.
- Use selective independent review.
- Bound retries and output.
- Use provider caching opportunistically.
- Track actual provider costs separately from user charges.
- Keep autosave, scheduling, dashboards and arithmetic outside the LLM pipeline.

Previously published results, saved answers, planning and catalogue reading remain accessible when credit is exhausted.

## 12. Architecture and data model

### Application stack

Use:

- Next.js and TypeScript.
- Tailwind with bundled dependencies.
- Neon Postgres and Drizzle schema migrations.
- Better Auth for Google authentication.
- Private Vercel Blob storage.
- Vercel Workflows for durable processing.
- Stripe Checkout.
- Server-only OpenAI and Google provider adapters.

Start with one application and one database. A vector database, general agent system and separate microservice fleet are unnecessary.

Pin deployed dependencies and model configurations after implementation validation.

### Core records

**Identity and access**

Users, provider accounts, sessions, family workspaces, memberships, invitations, learners and parent–learner links.

**Curriculum and catalogue**

Qualifications, subjects, specifications, units, syllabus topics, source documents, import runs, paper versions, sections, choice groups, question groups, resources and rubrics.

**Learning**

Enrolments, frozen practice sets, attempts, answer revisions, immutable submissions, question exposure, assessments, review decisions, corrective tasks and study sessions.

**Finance and operations**

Funding accounts, payments, rate cards, usage events, reservations, ledger entries, durable-job outbox and audit events.

Versioned question-to-topic mappings connect published question assessments to Topic History. Derived topic-history summaries must be reproducible from those underlying records.

### Invariants

- Every private record belongs to an authorised family and learner context.
- A submitted answer cannot be overwritten.
- An assessment references the exact answer and rubric versions used.
- A retry is a new submission.
- Planned dates and actual attempt dates are separate.
- Published catalogue corrections create new versions.
- Financial mutations are transactional and idempotent.
- Student-facing content never includes assistance that has not been released.
- Superuser invitation privileges are enforced server-side.

## 13. Interfaces and lifecycle

Use authenticated, validated application endpoints for:

- Identity and authorised workspaces.
- Superuser family and invitation administration.
- Invitation acceptance.
- Course enrolment and eligible catalogue browsing.
- Practice-set creation.
- Attempt creation and start.
- Revision-checked answer saving.
- Cost quotes and submission.
- Job status and published assessments.
- Student assessment queries and teacher decisions.
- Topic History.
- Credit and checkout.
- Study-plan approval.
- Calendar connect/disconnect.
- Restricted catalogue review and publication.

The Topic History endpoint accepts learner, specification/topic, date-range and mode filters. It returns chronological assessment evidence, aggregates and authorised assessment links.

Use a common error shape with a readable message, error code and request identifier. Inaccessible private resource identifiers return a non-disclosing response.

### State separation

**Catalogue:** discovered → staged → needs review → approved → published.

**Attempt:** draft → in progress → submitted, with abandoned as an alternative. A submitted attempt records whether it ended manually or at the deadline.

**Assessment processing:** awaiting funds or queued → marking → validating → needs review or published. Failed and cancelled states retain recovery information.

Guided questions create individual submissions within an ongoing set.

Use a transactional outbox for job dispatch and assume that background events can be delivered more than once. Enforce uniqueness in the database.

## 14. Privacy, reliability and administration

Require access checks for private records, exports, file delivery and background jobs.

Add database row-level isolation for private domain records under a restricted runtime role. Test isolation with connection pooling.

Keep API keys, storage credentials, OAuth tokens and superuser configuration server-side. Encrypt Calendar refresh tokens and redact secrets and answers from logs.

Treat question documents and student answers as untrusted content. Models cannot directly change permissions, balances or published marks.

Provide family export and deletion. Initial retention defaults:

- Active learning records remain until deletion is requested.
- Deleted application records and files are purged within 30 days.
- Backup expiry follows within a further 30 days.
- Redacted operational logs are retained for 30 days.
- Payment records follow the configured merchant retention requirements.

Take daily backups. A restore drill is an operator task and does not block creating a family.

Initial recovery targets:

- Recovery point within 24 hours.
- Recovery time within one working day.

Keep preview and production credentials, databases and stores separate. Do not copy production learner data into development as a routine workflow.

Provide operational views for:

- Failed or held marking jobs.
- Stale credit reservations.
- Import exceptions.
- Calendar failures.
- Payment reconciliation.
- Provider spending and global spending limits.

Use schema migrations and controlled catalogue publication for deployment. Never replace a live v2 database with a development snapshot.

## 15. Delivery stages

### Stage A — Foundation and catalogue

Build Google authentication, superuser invitations, family permissions, schemas, private storage and the one-time importer.

Approve a representative paper and scheme for each IA2 unit.

Exit criteria: private test families are isolated; the importer resumes safely; reviewed questions preserve their sources and rubrics.

### Stage B — Complete practice loop

Build guided and independent practice, typed answers, autosave, immutable submission, marking adapters, teacher review and feedback.

Use test credit and human publication while evaluating marking.

Exit criteria: a student completes a set, receives reviewed feedback and submits a separate correction without losing the original attempt.

### Stage C — Timed work and topic history

Build timed sections, complete mocks, deadline handling, recovery, unseen-paper reservation, Topic History and progress views.

Exit criteria: timing and recovery tests pass; topic timelines accurately separate independent and assisted work; complete mocks preserve all required questions and choices.

### Stage D — Family pilot

Complete real payment configuration, budgets, parent dashboards, study-plan approval and Calendar publishing.

Enable automatic release only for course/model configurations that pass evaluation.

Exit criteria: operational checks pass, catalogue distribution is authorised, payment accounting reconciles, and the initial family completes the production learning loop.

There is no v1 migration stage.

## 16. Acceptance tests

### Access

- Only the configured verified Google account receives superuser privileges.
- Uninvited accounts are blocked.
- Valid invitations admit only the intended recipient and role.
- Expired, revoked and reused invitations fail.
- Parents and students cannot issue invitations.
- Changing superuser configuration removes the old account’s elevated authority.
- Cross-family record, file, job, history and wallet access is denied.

### Importer

- Duplicate, misnamed, missing and corrupt documents produce explicit outcomes.
- Interrupted runs resume without duplicate content or unnecessary model calls.
- Source material remains attached to dependent questions.
- Optional-question totals reconcile correctly.
- Unsupported response formats block misleading full-mock publication.
- Corrections preserve previously published versions.

### Answering and timing

- All four modes apply the correct assistance policy.
- Autosave survives refresh, retries and connection interruption.
- Stale writes cannot overwrite newer work.
- Device takeover is explicit.
- Clock changes and tab closure cannot extend deadlines.
- Submission/expiry races produce one submission.
- Recovered late text does not change the original timed result.

### Marking and history

- Invalid marks, missing questions and inconsistent totals are rejected.
- Processing failure is not treated as a wrong answer.
- Reviewer disagreements reach the teacher queue.
- Moderation remains auditable.
- Topic history uses submission dates and correct mark-weighted aggregates.
- Mixed-topic questions do not create invented topic scores or duplicated totals.
- Assisted and repeated work remain distinguishable.
- Missing, single-point and sparse histories display honestly.
- Short sets do not generate qualification-grade predictions.

### Finance and integrations

- Concurrent jobs cannot overspend credit or student caps.
- Duplicate job and payment events cannot duplicate charges or credit.
- Failures, refunds and reversals reconcile.
- Calendar disconnection or service failure does not block study.
- Calendar retries do not create duplicate events.
- Time zones and daylight-saving changes behave correctly.
- Backups restore successfully and deletion follows the documented lifecycle.

## 17. Deferred work and remaining launch inputs

Deferred:

- Any v1 or historical-data migration.
- Handwritten submissions and stylus support.
- Unsupported graphical answer entry.
- School/class management.
- Public self-service signup.
- Unlimited tutor chat.
- Novel AI-generated assessed questions without reviewed rubrics.
- Two-way Calendar integration and existing-calendar availability ingestion.
- Continuous drive integration.
- Subscriptions and automatic credit top-ups.
- Overall qualification-grade prediction.

Inputs required before the relevant launch features are enabled:

- The source-paper folder and confirmed catalogue-use permission.
- Target exam session, Psychology option, taught topics and any time allowance.
- Vercel server configuration, including `SUPERUSER_EMAIL`.
- Google OAuth project and Calendar consent setup.
- Provider credentials and importer spending cap.
- Human-marked reference work and passing model configurations.
- Stripe merchant configuration, usage pricing and refund policy.

The specification contains no dependency on migrating v1 data. The one-time past-paper catalogue import and normal database schema migrations remain in scope.
