"use client";
import { useEffect, useState } from "react";
import { api, date, euro } from "./api";
import { useRead } from "./workspace-data";
import { DesktopHandoff, Pagination, ReadState } from "./desktop-handoff";
import { Button, Dialog, Empty, Meter, PageHeading } from "./ui";
import { StudyCompanion } from "./persona-shell";
import { CoursePlanning, Diary, topicName } from "./diary";
import { Funding } from "./parent-space";
import { Progress } from "./views";
import { score } from "./revision";
import { PerformanceChart } from "./performance-chart";
import { Groups } from "./groups";
import { destinationURL, type Destination } from "../lib/experience";
import { friendlyStatus, learnerStatus, type Persona } from "../lib/personas";
type Run = (fn: () => Promise<void>) => void;
type Props = {
  role: Persona;
  identity: any;
  route: Destination;
  onRoute: (v: Destination) => void;
  run: Run;
  busy: boolean;
  revision: number;
};

export function CompanionScreens({
  role,
  identity,
  route,
  onRoute,
  run,
  busy,
  revision,
}: Props) {
  const familyId = route.family || route.context || "";
  const familyData = useRead<
    import("../lib/workspace-contracts").WorkspaceSummary
  >(
    !["teacher", "superuser"].includes(role)
      ? `family/summary?family=${familyId}`
      : null,
    revision,
  );
  const refresh = async () => {
    await familyData.refresh();
  };
  if (role === "superuser")
    return <OperatorCompanion route={route} onRoute={onRoute} />;
  if (role === "teacher")
    return route.page === "Groups" ? (
      <Groups
        companion
        route={route}
        onRoute={onRoute}
        onAssessment={(id, family) => onRoute({ assessment: id, family })}
        run={run}
        busy={busy}
      />
    ) : (
      <TeacherCompanion route={route} onRoute={onRoute} run={run} busy={busy} />
    );
  if (!familyData.data)
    return <ReadState error={familyData.error} refresh={familyData.refresh} />;
  const data = familyData.data,
    learner =
      data.learners.find((l: any) => l.id === route.learner) ??
      data.learners[0];
  const courses = data.enrolments.filter(
    (c: any) => c.learner_id === learner?.id,
  );
  if (!learner)
    return (
      <Empty
        title="Your workspace is ready"
        text="A student will appear when their access is set up."
      />
    );
  if (role === "parent") {
    if (route.page === "Credit")
      return (
        <FundingScreen
          familyId={familyId}
          route={route}
          onRoute={onRoute}
          run={run}
          busy={busy}
          revision={revision}
        />
      );
    if (route.page === "Progress")
      return (
        <ProgressOverview
          familyId={familyId}
          people={data.learners}
          courses={data.enrolments}
          route={route}
          onRoute={onRoute}
          run={run}
        />
      );
    if (route.page === "Plan")
      return (
        <Diary
          familyId={familyId}
          learnerId={learner.id}
          courses={courses}
          calendar={data.calendar}
          route={route}
          onRoute={onRoute}
          onAttempt={() => {}}
          run={run}
          busy={busy}
          refresh={refresh}
          readOnly
        />
      );
    if (route.page === "FamilySettings")
      return (
        <DesktopHandoff
          title="Family data settings"
          href={destinationURL(route)}
        />
      );
    return (
      <ParentCompanion data={data} familyId={familyId} onRoute={onRoute} />
    );
  }
  if (route.page === "Subjects" || route.page === "Study")
    return (
      <>
        <PageHeading
          label="YOUR SUBJECTS"
          title="Keep your study plans in step."
          text="Update what you have covered, your routine and your exam dates."
        />
        {courses.map((c: any) => (
          <CoursePlanning
            key={c.id}
            course={c}
            familyId={familyId}
            learnerId={learner.id}
            topics={data.topics?.[c.data.subject] ?? []}
            run={run}
            busy={busy}
            refresh={refresh}
          />
        ))}
        <DesktopHandoff
          title={
            courses.length
              ? "Course setup on your computer"
              : "Add your first subject on a computer"
          }
          href={destinationURL({ ...route, page: "Study", attempt: "" })}
        >
          <p>
            {courses.length
              ? "Changes to qualification, specification, syllabus options and extra time belong in the full course workspace."
              : "Once your subject is set up, its diary and progress will appear here."}
          </p>
        </DesktopHandoff>
      </>
    );
  if (route.page === "Plan")
    return (
      <Diary
        familyId={familyId}
        learnerId={learner.id}
        courses={courses}
        calendar={data.calendar}
        route={route}
        onRoute={onRoute}
        onAttempt={(id) => onRoute({ attempt: id })}
        run={run}
        busy={busy}
        refresh={refresh}
      />
    );
  if (route.page === "Progress")
    return (
      <ProgressOverview
        familyId={familyId}
        people={data.learners}
        courses={data.enrolments}
        route={route}
        onRoute={onRoute}
        run={run}
        onAttempt={(id) => onRoute({ attempt: id })}
      />
    );
  if (["Practice", "Papers"].includes(route.page ?? ""))
    return (
      <DesktopHandoff
        title="Practice on your computer"
        href={destinationURL(route)}
      />
    );
  const unfinished =
    data.attempts.find((a: any) => a.state === "in_progress") ??
    data.attempts.find((a: any) => a.state === "draft");
  const planned = data.sessions
    .filter((s: any) => s.learner_id === learner.id)
    .sort((a: any, b: any) => a.data.start.localeCompare(b.data.start));
  return (
    <>
      <PageHeading
        label="YOUR LEARNING COMPANION"
        title={`A little clearer, ${learner.name.split(" ")[0]}.`}
        text="Your plans, progress and next steps, wherever you are."
      />
      <section className="companion-welcome">
        <div>
          <p className="eyebrow">KEEP UP & ORGANISE</p>
          <h2>
            {planned.length
              ? "A little space to focus."
              : "Make a plan that fits."}
          </h2>
          <p>
            {planned[0]
              ? `${planned[0].data.title} · ${date(planned[0].data.start)}`
              : "Choose a manageable time for your next study session."}
          </p>
          <Button onClick={() => onRoute({ page: "Plan", attempt: "" })}>
            Open my diary →
          </Button>
        </div>
        <StudyCompanion />
      </section>
      <GoalCard
        familyId={familyId}
        learnerId={learner.id}
        run={run}
        busy={busy}
      />
      {unfinished && (
        <DesktopHandoff
          href={destinationURL({
            ...route,
            page: "Today",
            attempt: unfinished.id,
          })}
          familyId={familyId}
          attempt={unfinished.id}
        />
      )}
      <FeedbackCards
        assessments={data.assessments}
        onOpen={(id) => onRoute({ assessment: id })}
      />
      <UpcomingExams courses={courses} />
      {!courses.length && (
        <DesktopHandoff
          title="Set up your first course"
          href={destinationURL({ ...route, page: "Study" })}
        />
      )}
    </>
  );
}
function GoalCard({
  familyId,
  learnerId,
  run,
  busy,
}: {
  familyId: string;
  learnerId: string;
  run: Run;
  busy: boolean;
}) {
  const read = useRead(
      `family/motivation?family=${familyId}&learner=${learnerId}`,
    ),
    [editing, setEditing] = useState(false);
  if (!read.data)
    return <ReadState error={read.error} refresh={read.refresh} />;
  const value = read.data;
  return (
    <section className="companion-goal card">
      <div className="row">
        <h2>Your week, your pace</h2>
        <button className="link-button" onClick={() => setEditing(true)}>
          Edit goal
        </button>
      </div>
      <p className="goal-count">
        <strong>{value.weekly}</strong> / {value.goal} sessions
      </p>
      <Meter
        value={value.weekly}
        max={value.goal}
        label="Weekly completed practice sessions"
      />
      <p className="meta">
        Monday–Sunday · {value.timezone}. Every answered, submitted session
        counts.
      </p>
      <p>
        {value.milestones.length
          ? `Participation milestones: ${value.milestones.join(", ")} sessions.`
          : "Your first completion milestone is ahead."}
      </p>
      {editing && (
        <Dialog title="Your weekly goal" onClose={() => setEditing(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(async () => {
                await api("family/motivation", {
                  familyId,
                  learnerId,
                  goal: Number(f.get("goal")),
                  timezone: f.get("timezone"),
                });
                read.refresh();
                setEditing(false);
              });
            }}
          >
            <label className="field">
              Sessions per week
              <input
                name="goal"
                type="number"
                min="1"
                max="7"
                defaultValue={value.goal}
                required
              />
            </label>
            <label className="field">
              Goal timezone
              <input name="timezone" defaultValue={value.timezone} required />
            </label>
            <Button disabled={busy}>Save goal</Button>
          </form>
        </Dialog>
      )}
    </section>
  );
}
function FeedbackCards({
  assessments,
  onOpen,
}: {
  assessments: any[];
  onOpen: (id: string) => void;
}) {
  return (
    <section className="section">
      <h2>A little feedback, a next step</h2>
      <div className="companion-list">
        {assessments.map((r) => {
          const marks = score(r.effective);
          return (
            <button
              key={r.id}
              className="feedback-card"
              onClick={() => onOpen(r.id)}
            >
              <span>
                <strong className="capitalize">{r.subject}</strong>
                <small>
                  {date(r.submitted_at)} · {learnerStatus(r.state)}
                </small>
              </span>
              <span>{marks ? `${marks.percentage}%` : "Pending"} →</span>
            </button>
          );
        })}
      </div>
      {!assessments.length && (
        <p className="empty-inline">
          Your first insight is ahead. Published feedback will appear here after
          practice.
        </p>
      )}
    </section>
  );
}
function UpcomingExams({ courses }: { courses: any[] }) {
  const exams = courses.flatMap((c) =>
    (c.data.examDates ?? [])
      .filter((e: any) => e.date >= new Date().toISOString().slice(0, 10))
      .map((e: any) => ({ ...e, subject: c.data.subject })),
  );
  return exams.length ? (
    <section className="section">
      <h2>Exams ahead</h2>
      {exams
        .sort((a: any, b: any) => a.date.localeCompare(b.date))
        .map((e: any, i: number) => (
          <article className="diary-entry" key={i}>
            <strong className="capitalize">
              {e.subject} · {e.unit}
            </strong>
            <p>
              {e.date} · {e.confirmed ? "Confirmed" : "Check with your school"}
            </p>
          </article>
        ))}
    </section>
  ) : null;
}
function ParentCompanion({
  data,
  familyId,
  onRoute,
}: {
  data: any;
  familyId: string;
  onRoute: (v: Destination) => void;
}) {
  const funding = useRead(`family/funding?family=${familyId}&limit=1`);
  return (
    <>
      <PageHeading
        label="YOUR FAMILY COMPANION"
        title="A window into their week."
        text="See the effort, follow the feedback and help when needed."
      />
      {funding.data && (
        <section className="companion-funding">
          <p className="eyebrow">FAMILY FUNDING</p>
          <h2>
            {euro(
              Number(funding.data.wallet.balance) -
                Number(funding.data.wallet.reserved),
            )}{" "}
            available
          </h2>
          <p>
            {funding.data.wallet.awaiting.length
              ? `${funding.data.wallet.awaiting.length} assessments need funding attention.`
              : "Credit and spending limits are in your hands."}
          </p>
          <Button onClick={() => onRoute({ page: "Credit" })}>
            Manage funding →
          </Button>
        </section>
      )}
      <div className="companion-list">
        {data.learners.map((l: any) => (
          <section className="card" key={l.id}>
            <p className="eyebrow">THEIR LEARNING</p>
            <h2>{l.name}</h2>
            <p>
              {data.enrolments
                .filter((c: any) => c.learner_id === l.id)
                .map((c: any) => c.data.subject)
                .join(" · ") || "Subjects not set up yet"}
            </p>
            <FeedbackCards
              assessments={data.assessments
                .filter(
                  (a: any) => a.learner_id === l.id && a.state === "published",
                )
                .slice(0, 2)}
              onOpen={(id) => onRoute({ assessment: id, learner: l.id })}
            />
            <h3>Coming up</h3>
            {data.sessions
              .filter((s: any) => s.learner_id === l.id)
              .slice(0, 2)
              .map((s: any) => (
                <p key={s.id}>
                  {s.data.title}
                  <small className="meta"> · {date(s.data.start)}</small>
                </p>
              ))}
            <UpcomingExams
              courses={data.enrolments.filter(
                (c: any) => c.learner_id === l.id,
              )}
            />
            <button
              className="link-button"
              onClick={() =>
                onRoute({ page: "Progress", learner: l.id, offset: "0" })
              }
            >
              See {l.name.split(" ")[0]}’s progress →
            </button>
            <button
              className="link-button"
              onClick={() =>
                onRoute({ page: "Plan", learner: l.id, offset: "0" })
              }
            >
              Read study diary →
            </button>
          </section>
        ))}
      </div>
    </>
  );
}
export function FundingScreen({
  familyId,
  route,
  onRoute,
  run,
  busy,
  revision = 0,
}: {
  familyId: string;
  route: Destination;
  onRoute: (v: Destination) => void;
  run: Run;
  busy: boolean;
  revision?: number;
}) {
  const read = useRead(
    `family/funding?${new URLSearchParams({ family: familyId, offset: route.offset ?? "0", ...(route.paymentId ? { paymentId: route.paymentId } : {}) })}`,
    revision,
  );
  const paymentStatus = read.data?.payment?.status;
  useEffect(() => {
    if (
      route.payment !== "return" ||
      !route.paymentId ||
      (paymentStatus && paymentStatus !== "pending")
    )
      return;
    const timer = setInterval(() => {
        void read.refresh();
      }, 3000),
      stop = setTimeout(() => clearInterval(timer), 30000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [route.payment, route.paymentId, paymentStatus, read.refresh]);
  return !read.data ? (
    <ReadState error={read.error} refresh={read.refresh} />
  ) : (
    <>
      {route.payment && (
        <p role="status" className="notice">
          {route.payment === "cancelled"
            ? "Checkout was cancelled. Your funding account is unchanged."
            : read.data.payment?.status === "paid" &&
                Number(read.data.payment?.credited_cents) > 0
              ? "Payment confirmed. Your credit is available and eligible marking continues automatically."
              : read.data.payment?.status === "refunded"
                ? "This payment has been refunded. The account activity shows the adjustment."
                : read.data.payment?.status === "disputed"
                  ? "This payment is disputed. Check the account activity for its credit adjustment."
                  : "Waiting for payment confirmation. Your credit will update when the payment is verified."}
        </p>
      )}
      {route.payment === "return" && (
        <button className="link-button" onClick={read.refresh}>
          Refresh payment status
        </button>
      )}
      <Funding
        data={read.data}
        familyId={familyId}
        run={run}
        busy={busy}
        refresh={async () => {
          await read.refresh();
        }}
      />
      <Pagination
        {...read.data}
        onChange={(offset) => onRoute({ offset: String(offset) })}
      />
    </>
  );
}
export function ProgressOverview({
  familyId,
  people,
  courses,
  route,
  onRoute,
  run,
  onPractice,
  onAttempt,
}: {
  familyId: string;
  people: any[];
  courses: any[];
  route: Destination;
  onRoute: (v: Destination) => void;
  run: Run;
  onPractice?: (topic: string) => void;
  onAttempt?: (id: string) => void;
}) {
  const tab = route.tab || (route.topic ? "topics" : "overview");
  const learner = people.find((l) => l.id === route.learner) ?? people[0],
    mine = courses.filter((c) => c.learner_id === learner?.id),
    course =
      mine.find((c) => c.id === route.course) ??
      (tab === "topics" ? mine[0] : undefined);
  const rangeEnd = new Date().toISOString().slice(0, 10);
  const rangeStart = (days: number) => {
    const day = new Date(rangeEnd + "T12:00:00Z");
    day.setUTCDate(day.getUTCDate() - days + 1);
    return day.toISOString().slice(0, 10);
  };
  const read = useRead(
    learner && tab !== "topics"
      ? `family/activity?${new URLSearchParams({ family: familyId, learner: learner.id, kind: tab === "activity" ? "attempts" : "assessments", offset: route.offset ?? "0", ...(course ? { subject: course.data.subject } : {}), ...(route.from ? { from: route.from } : {}), ...(route.to ? { to: route.to } : {}) })}`
      : null,
  );
  return (
    <>
      <PageHeading
        label="PROGRESS"
        title="See how you’re doing."
        text={`${learner?.name ?? "Student"}’s progress, one practice at a time.`}
      />
      <div className="progress-scope">
        {people.length > 1 && (
          <label className="field">
            Student
            <select
              value={learner?.id ?? ""}
              onChange={(e) =>
                onRoute({
                  learner: e.target.value,
                  course: "",
                  topic: "",
                  offset: "0",
                })
              }
            >
              {people.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          Subject
          <select
            value={course?.id ?? ""}
            onChange={(e) =>
              onRoute({ course: e.target.value, topic: "", offset: "0" })
            }
          >
            {tab !== "topics" && <option value="">All subjects</option>}
            {mine.map((c) => (
              <option key={c.id} value={c.id}>
                {c.data.subject}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Period
          <select
            aria-label="Progress period"
            value={
              !route.from && !route.to
                ? "all"
                : route.to === rangeEnd && route.from === rangeStart(28)
                  ? "28"
                  : route.to === rangeEnd && route.from === rangeStart(90)
                    ? "90"
                    : "custom"
            }
            onChange={(e) => {
              if (e.target.value !== "custom")
                onRoute({
                  from:
                    e.target.value === "all"
                      ? ""
                      : rangeStart(Number(e.target.value)),
                  to: e.target.value === "all" ? "" : rangeEnd,
                  offset: "0",
                });
            }}
          >
            <option value="all">All time</option>
            <option value="28">Last 4 weeks</option>
            <option value="90">Last 3 months</option>
            <option value="custom" disabled>
              Custom dates
            </option>
          </select>
        </label>
        <details className="progress-date-settings">
          <summary>Custom dates</summary>
          <div className="form-grid">
            {" "}
            <label className="field">
              History from
              <input
                type="date"
                value={route.from ?? ""}
                onChange={(e) => onRoute({ from: e.target.value, offset: "0" })}
              />
            </label>
            <label className="field">
              History to
              <input
                type="date"
                value={route.to ?? ""}
                onChange={(e) => onRoute({ to: e.target.value, offset: "0" })}
              />
            </label>
          </div>
        </details>
      </div>
      {tab === "overview" && read.data && (
        <PerformanceChart
          items={read.data.items}
          total={read.data.total}
          onOpen={(id) => onRoute({ assessment: id })}
        />
      )}
      <div
        className="segmented section"
        role="group"
        aria-label="Progress view"
      >
        {[
          ["overview", "Overview"],
          ["history", "Published feedback"],
          ["topics", "Topic trends"],
          ["activity", "Practice activity"],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={tab === value}
            onClick={() => onRoute({ tab: value, offset: "0" })}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "topics" ? (
        <Progress
          initialTopic={route.topic}
          familyId={familyId}
          learnerId={learner?.id ?? ""}
          course={course ?? mine[0]}
          run={run}
          onAssessment={(id) => onRoute({ assessment: id })}
          onPractice={onPractice}
        />
      ) : !read.data ? (
        <ReadState error={read.error} refresh={read.refresh} />
      ) : (
        <>
          <h2 className="progress-results-heading">
            {tab === "overview"
              ? "Behind the results"
              : tab === "activity"
                ? "Practice activity"
                : "Published feedback"}
          </h2>
          <div className="companion-list">
            {read.data.items.map((r: any) => {
              const marks = score(r.effective);
              return (
                <article className="activity-entry" key={r.id}>
                  <div>
                    <p className="eyebrow capitalize">
                      {r.subject} · {friendlyStatus(r.mode)}
                    </p>
                    <h2>
                      {marks
                        ? `${marks.awarded}/${marks.available} marks · ${marks.percentage}%`
                        : learnerStatus(r.state)}
                    </h2>
                    <p className="meta">
                      {date(r.submitted_at ?? r.created_at)}
                      {r.assisted
                        ? ` · ${r.assisted === "true" ? "Assisted" : "Unassisted"}`
                        : ""}
                    </p>
                  </div>
                  {tab === "activity" &&
                    onAttempt &&
                    ["draft", "in_progress"].includes(r.state) && (
                      <button
                        className="button secondary"
                        onClick={() => onAttempt(r.id)}
                      >
                        {onPractice
                          ? "Resume practice"
                          : "Continue on a computer"}
                      </button>
                    )}
                  {(tab === "history" || tab === "overview") && (
                    <button
                      className="button secondary"
                      onClick={() => onRoute({ assessment: r.id })}
                    >
                      Answer & feedback
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          {!read.data.items.length && (
            <Empty
              title="Evidence will appear here"
              text="There are no results matching these filters. This does not indicate poor performance."
            />
          )}
          <Pagination
            {...read.data}
            onChange={(offset) => onRoute({ offset: String(offset) })}
          />
        </>
      )}
    </>
  );
}
function TeacherCompanion({
  route,
  onRoute,
  run,
  busy,
}: {
  route: Destination;
  onRoute: (v: Destination) => void;
  run: Run;
  busy: boolean;
}) {
  const groups = useRead("teacher/groups");
  const read = useRead(
    `teacher/workspace?${new URLSearchParams({ view: route.student ? "students" : route.page === "Students" ? "students" : "overview", offset: route.offset ?? "0", ...(route.filterFamily ? { family: route.filterFamily } : {}), ...(route.student ? { learner: route.student } : {}), ...(route.subject ? { subject: route.subject } : {}), ...(route.status ? { status: route.status } : {}), ...(route.search ? { search: route.search } : {}), ...(route.group ? { group: route.group } : {}) })}`,
  );
  const [search, setSearch] = useState(route.search ?? "");
  const selected = read.data?.students.find((s: any) => s.id === route.student);
  const detail = useRead(
    selected ? `family/summary?family=${selected.family_id}` : null,
  );
  if (!read.data)
    return <ReadState error={read.error} refresh={read.refresh} />;
  const change = (patch: Destination) =>
    onRoute({ ...patch, student: "", offset: "0" });
  return (
    <>
      <PageHeading
        label="YOUR TEACHING COMPANION"
        title="Know where to help."
        text="A quick view across your authorised families. Review and publication happen on your computer."
      />
      <div className="companion-counts">
        <span>
          <strong>{read.data.totals.students}</strong> students
        </span>
        <span>
          <strong>{read.data.totals.actionable}</strong> reviews
        </span>
        <span>
          <strong>{read.data.totals.blocked}</strong> blockers
        </span>
      </div>
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          change({ search });
        }}
      >
        <label className="field">
          Find a student
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <Button variant="secondary">Search</Button>
        <label className="field">
          Family
          <select
            value={route.filterFamily ?? ""}
            onChange={(e) => change({ filterFamily: e.target.value })}
          >
            <option value="">All my families</option>
            {read.data.families.map((f: any) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Subject
          <select
            value={route.subject ?? ""}
            onChange={(e) => change({ subject: e.target.value })}
          >
            <option value="">All subjects</option>
            <option value="psychology">Psychology</option>
            <option value="business">Business</option>
          </select>
        </label>
        <label className="field">
          Group
          <select
            value={route.group ?? ""}
            onChange={(e) => change({ group: e.target.value })}
          >
            <option value="">All students</option>
            {groups.data?.groups.map((g: any) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Attention
          <select
            value={route.status ?? ""}
            onChange={(e) => change({ status: e.target.value })}
          >
            <option value="">All states</option>
            {["needs_review", "failed", "awaiting_funds", "published"].map(
              (s) => (
                <option key={s} value={s}>
                  {friendlyStatus(s)}
                </option>
              ),
            )}
          </select>
        </label>
      </form>
      {selected ? (
        <>
          <button
            className="link-button"
            onClick={() => onRoute({ student: "", learner: "", family: "" })}
          >
            ← All students
          </button>
          <section className="card">
            <p className="eyebrow">{selected.family_name}</p>
            <h2>{selected.name}</h2>
            <p>
              {selected.courses
                .map((c: any) => `${c.subject} · ${c.targetSession}`)
                .join(" / ") || "No course set up yet"}
            </p>
            <p>
              {selected.pending} pending reviews · {selected.open_attempts} open
              sessions
            </p>
          </section>
          {detail.data && (
            <>
              <ProgressOverview
                familyId={selected.family_id}
                people={detail.data.learners.filter(
                  (l: any) => l.id === selected.id,
                )}
                courses={detail.data.enrolments.filter(
                  (c: any) => c.learner_id === selected.id,
                )}
                route={{ ...route, learner: selected.id }}
                onRoute={onRoute}
                run={run}
              />
              <details className="section">
                <summary>Upcoming study</summary>
                {detail.data.sessions
                  .filter((s: any) => s.learner_id === selected.id)
                  .map((s: any) => (
                    <p key={s.id}>
                      {s.data.title} · {date(s.data.start)}
                    </p>
                  ))}
              </details>
            </>
          )}
        </>
      ) : (
        <>
          <div className="companion-list">
            {read.data.students.map((s: any) => (
              <button
                className="student-summary"
                key={s.id}
                onClick={() =>
                  onRoute({
                    page: "Students",
                    student: s.id,
                    family: s.family_id,
                    learner: s.id,
                    offset: "0",
                  })
                }
              >
                <strong>{s.name}</strong>
                <span>{s.family_name}</span>
                <small>
                  {s.pending
                    ? "Review their submitted work."
                    : s.open_attempts
                      ? "An unfinished session is open."
                      : s.latest?.state === "published"
                        ? "Published feedback is available."
                        : "Look for a first piece of published evidence."}
                </small>
                <span>
                  {s.pending} reviews · {s.open_attempts} open sessions →
                </span>
              </button>
            ))}
          </div>
          <Pagination
            offset={read.data.offset}
            limit={25}
            total={read.data.totals.students}
            onChange={(offset) => onRoute({ offset: String(offset) })}
          />
        </>
      )}
      <section className="section">
        <h2>Work needing attention</h2>
        {read.data.reviews.map((r: any) => (
          <article className="reminder-item" key={r.id}>
            <h3>{r.learner_name}</h3>
            <p className="meta">
              {r.family_name} · {r.subject} · {date(r.submitted_at)}
            </p>
            <p>
              {r.has_query ? "Student query · " : ""}
              {friendlyStatus(r.state)}
            </p>
            <button
              className="link-button"
              onClick={() => onRoute({ assessment: r.id, family: r.family_id })}
            >
              Read submitted work →
            </button>
          </article>
        ))}
        <Pagination
          offset={read.data.offset}
          limit={25}
          total={read.data.totals.reviews}
          onChange={(offset) => onRoute({ offset: String(offset) })}
        />
      </section>
    </>
  );
}
export function TeacherStudentEvidence({
  route,
  onRoute,
  run,
}: {
  route: Destination;
  onRoute: (v: Destination) => void;
  run: Run;
}) {
  const read = useRead(
    route.student && route.filterFamily
      ? `family/summary?family=${route.filterFamily}`
      : null,
  );
  if (!route.student || !route.filterFamily) return null;
  if (!read.data)
    return <ReadState error={read.error} refresh={read.refresh} />;
  return (
    <section className="section">
      <ProgressOverview
        familyId={route.filterFamily}
        people={read.data.learners.filter((l: any) => l.id === route.student)}
        courses={read.data.enrolments.filter(
          (c: any) => c.learner_id === route.student,
        )}
        route={{ ...route, learner: route.student }}
        onRoute={(v) => onRoute({ ...v, family: route.filterFamily })}
        run={run}
      />
      <details className="section">
        <summary>Upcoming study and exam context</summary>
        {read.data.sessions
          .filter((s: any) => s.learner_id === route.student)
          .map((s: any) => (
            <p key={s.id}>
              {s.data.title} · {date(s.data.start)}
            </p>
          ))}
        <UpcomingExams
          courses={read.data.enrolments.filter(
            (c: any) => c.learner_id === route.student,
          )}
        />
      </details>
    </section>
  );
}
function OperatorCompanion({
  route,
  onRoute,
}: {
  route: Destination;
  onRoute: (v: Destination) => void;
}) {
  const kind =
    route.page === "Families"
      ? "families"
      : route.page === "Invitations"
        ? "invitations"
        : route.page === "Content"
          ? "content"
          : route.page === "Operations"
            ? "operations"
            : ["invitations", "content", "operations"].includes(route.tab ?? "")
              ? route.tab!
              : "operations";
  const read = useRead(
    `admin/companion?${new URLSearchParams({ kind, offset: route.offset ?? "0", search: route.search ?? "", ...(route.student ? { id: route.student } : {}) })}`,
  );
  const [search, setSearch] = useState(route.search ?? "");
  if (!read.data)
    return <ReadState error={read.error} refresh={read.refresh} />;
  const data = read.data;
  return (
    <>
      <PageHeading
        label="OPERATIONS COMPANION"
        title="Keep learning moving."
        text="Check access and operational status. Make administrative changes on your computer."
      />
      <div className="operator-status-grid">
        {Object.entries(data.counts).map(([name, count]) => (
          <button
            className="status-summary"
            key={name}
            onClick={() =>
              onRoute({
                page: name === "families" ? "Families" : "Queues",
                tab: name,
                offset: "0",
                student: "",
              })
            }
          >
            <strong>{String(count)}</strong>
            <span className="capitalize">{name}</span>
          </button>
        ))}
      </div>
      <form
        className="card row"
        onSubmit={(e) => {
          e.preventDefault();
          onRoute({ search, offset: "0" });
        }}
      >
        <label className="field">
          Find {kind}
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <Button variant="secondary">Search</Button>
      </form>
      <div className="companion-list">
        {data.items.map((item: any) => (
          <article className="activity-entry" key={item.id}>
            <div>
              <h2>
                {item.name ??
                  item.email ??
                  item.identity ??
                  (item.kind === "mark"
                    ? "Assessment processing"
                    : "Calendar or scheduled processing")}
              </h2>
              <p className="meta">
                {item.suspended
                  ? "Access suspended"
                  : item.accepted_at
                    ? "Invitation accepted"
                    : item.revoked_at
                      ? "Invitation revoked"
                      : item.expires_at
                        ? `Expires ${date(item.expires_at)}`
                        : item.status
                          ? friendlyStatus(item.status)
                          : item.state
                            ? friendlyStatus(item.state)
                            : "Workspace active"}
              </p>
            </div>
            {kind === "families" && (
              <button
                className="link-button"
                onClick={() => onRoute({ student: item.id })}
              >
                Inspect access →
              </button>
            )}
          </article>
        ))}
      </div>
      {data.members.length > 0 && (
        <section className="card">
          <h2>Family access</h2>
          {data.members.map((m: any, i: number) => (
            <p key={i}>
              {m.name} · {m.role} · {m.active ? "Active" : "Inactive"}
              <small className="meta"> · {m.email}</small>
            </p>
          ))}
          {data.invitations.map((i: any) => (
            <p key={i.id}>
              {i.email} ·{" "}
              {i.accepted_at
                ? "Accepted"
                : i.revoked_at
                  ? "Revoked"
                  : `Expires ${date(i.expires_at)}`}
            </p>
          ))}
        </section>
      )}
      <Pagination
        offset={data.offset}
        limit={data.limit}
        total={
          data.more
            ? data.offset + data.limit + 1
            : data.offset + data.items.length
        }
        onChange={(offset) => onRoute({ offset: String(offset) })}
      />
      <DesktopHandoff
        title="Open the operating workspace"
        href={destinationURL({
          ...route,
          page:
            kind === "families"
              ? "Families"
              : kind === "invitations"
                ? "Invitations"
                : kind === "content"
                  ? "Content"
                  : "Operations",
        })}
      />
    </>
  );
}
