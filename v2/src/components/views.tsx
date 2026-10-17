"use client";
import { useEffect, useRef, useState } from "react";
import { api, date } from "./api";
import { PageHeading, Empty, Dialog, Icon } from "./ui";
import { Button, Meter } from "./ui";
import { score } from "./revision";
import { CourseSetup } from "./course-setup";
import { QuestionExtracts } from "./extracts";
import { friendlyStatus } from "../lib/personas";
type Run = (fn: () => Promise<void>) => void;
export function Progress({
  initialTopic,
  familyId,
  learnerId,
  course,
  run,
  onAssessment,
  onPractice,
}: {
  initialTopic?: string;
  familyId: string;
  learnerId: string;
  course: any;
  run: Run;
  onAssessment: (id: string) => void;
  onPractice: (topic: string) => void;
}) {
  const [topic, setTopic] = useState(""),
    [rows, setRows] = useState<any[] | null>(null),
    [assisted, setAssisted] = useState(false),
    [mode, setMode] = useState(""),
    [from, setFrom] = useState(
      new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
    ),
    [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const requestVersion = useRef(0);
  async function load() {
    const version = ++requestVersion.current;
    setRows(null);
    if (!course || !topic) return;
    try {
      const result = await api("family/history", {
        familyId,
        learnerId,
        specification: course.data.specification,
        topic,
        assisted,
        mode: mode || undefined,
        from: `${from}T00:00:00.000Z`,
        to: `${to}T23:59:59.999Z`,
      });
      if (version === requestVersion.current) setRows(result);
    } catch (error) {
      if (version === requestVersion.current) setRows([]);
      throw error;
    }
  }
  useEffect(() => {
    setTopic(
      initialTopic && course?.data.taughtTopics.includes(initialTopic)
        ? initialTopic
        : (course?.data.taughtTopics[0] ?? ""),
    );
    setRows(null);
    requestVersion.current++;
  }, [course?.id, initialTopic]);
  useEffect(() => {
    run(load);
    return () => {
      requestVersion.current++;
    };
  }, [topic, assisted, mode, from, to, learnerId, course?.id]);
  return (
    <>
      <PageHeading
        label="PROGRESS · TOPIC HISTORY"
        title="Progress, backed by evidence."
        text="Track marks over time. Question difficulty and practice conditions matter, so every result keeps its context."
      />
      <section className="card stack">
        <div className="form-grid">
          <label className="field">
            Syllabus topic
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">Choose a topic</option>
              {course?.data.taughtTopics.map((t: string) => (
                <option key={t} value={t}>
                  {topicLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Practice conditions
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="">Independent attempts</option>
              {["guided", "independent", "timed", "mock"].map((m) => (
                <option key={m} value={m}>
                  {friendlyStatus(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="field">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <label>
          <input
            type="checkbox"
            checked={assisted}
            onChange={(e) => setAssisted(e.target.checked)}
          />{" "}
          Show assisted work instead
        </label>
      </section>
      {rows && rows.length > 0 ? (
        <section className="card" style={{ marginTop: 24 }}>
          <div className="row">
            <h2>{topicLabel(topic)}</h2>
            <button
              className="button secondary small"
              onClick={() => onPractice(topic)}
            >
              Practise this topic →
            </button>
          </div>
          <div className="history-stats">
            <div>
              <strong>
                {Math.round(
                  (100 * rows.reduce((n, r) => n + r.awarded, 0)) /
                    rows.reduce((n, r) => n + r.available, 0),
                )}
                %
              </strong>
              <span>Mark-weighted score · selected period</span>
            </div>
            <div>
              <strong>
                {rows.reduce((n, r) => n + r.available, 0) -
                  rows.reduce((n, r) => n + r.awarded, 0)}
              </strong>
              <span>Marks not yet earned</span>
            </div>
            <div>
              <strong>{rows.length}</strong>
              <span>Assessed sessions</span>
            </div>
          </div>
          <svg
            className="history-chart"
            viewBox="0 0 700 200"
            role="img"
            aria-label={`Chronological performance chart, ${rows.length} assessed sessions. Exact results are in the table below.`}
          >
            {[0, 25, 50, 75, 100].map((v) => (
              <g key={v}>
                <line
                  x1="35"
                  x2="690"
                  y1={180 - v * 1.6}
                  y2={180 - v * 1.6}
                  stroke="#dce2d8"
                />
                <text x="0" y={184 - v * 1.6}>
                  {v}%
                </text>
              </g>
            ))}
            {rows.map((r, i) => {
              const x =
                  rows.length === 1 ? 360 : 50 + (i * 620) / (rows.length - 1),
                y = 180 - r.percentage * 1.6;
              return (
                <circle key={r.submissionId} cx={x} cy={y} r="6" fill="#244e40">
                  <title>
                    {date(r.submittedAt)}: {Math.round(r.percentage)}%,{" "}
                    {r.awarded}/{r.available}
                  </title>
                </circle>
              );
            })}
          </svg>
          <p className="muted">
            {rows.length === 1
              ? "One observation is a starting point, not a trend."
              : "Points show individual sessions; they are not a mastery prediction."}
          </p>
          <div className="overflow">
            <table>
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Evidence</th>
                  <th>Conditions</th>
                  <th>Result</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.submissionId}>
                    <td>{date(r.submittedAt)}</td>
                    <td>
                      {r.questionCount} questions · {r.available} marks
                      {r.mixed ? " · mixed-topic evidence" : ""}
                    </td>
                    <td>
                      {r.evidence[0].mode} ·{" "}
                      {r.evidence[0].assisted ? "assisted" : "independent"}
                      {r.evidence.some((e: any) => e.seen)
                        ? " · previously seen"
                        : ""}
                    </td>
                    <td>
                      {r.awarded}/{r.available} ({Math.round(r.percentage)}%)
                    </td>
                    <td>
                      <button
                        className="link-button"
                        onClick={() => onAssessment(r.submissionId)}
                      >
                        Answer & feedback
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : topic && rows === null ? (
        <p className="loading" role="status">
          Loading topic evidence…
        </p>
      ) : (
        <div style={{ marginTop: 24 }}>
          <Empty
            title="Your topic history starts here"
            text="Published assessments matching these filters will appear here. Pending reviews and failed marking are excluded."
          />
        </div>
      )}
    </>
  );
}
const courseSubjects = [
  { id: "psychology", label: "Psychology", code: "YPS01" },
  { id: "business", label: "Business", code: "YBS11" },
] as const;
function topicLabel(id: string) {
  const text = id.replaceAll(".", " ").replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function studyTimes(slots: { day: number; start: string; minutes: number }[]) {
  const names = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return slots
    .map((slot) => {
      const [hour, minute] = slot.start.split(":").map(Number);
      const end = hour * 60 + minute + slot.minutes;
      const endText = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
      return `${names[slot.day]} ${slot.start}–${endText}`;
    })
    .join(" · ");
}
export function FamilySettings({
  familyId,
  learnerId,
  learners,
  enrolments,
  papers,
  run,
  refresh,
  courseEdit,
}: {
  familyId: string;
  learnerId: string;
  learners: any[];
  enrolments: any[];
  papers: any[];
  run: Run;
  refresh: () => Promise<void>;
  courseEdit?: { subject: string; at: number } | null;
}) {
  const student = learners.find((person) => person.id === learnerId);
  const mine = enrolments.filter((item) => item.learner_id === learnerId);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [releasing, setReleasing] = useState<any>(null);
  useEffect(() => {
    setEditing(null);
    setRemoving(null);
  }, [learnerId]);
  useEffect(() => {
    if (courseEdit) setEditing(courseEdit.subject);
  }, [courseEdit]);
  const removingSubject = courseSubjects.find(
    (subject) => subject.id === removing,
  );
  return (
    <>
      <PageHeading
        label="MY SUBJECTS / COURSE SETTINGS"
        title={
          mine.length
            ? "Make room for your subjects."
            : "Let’s find your starting point."
        }
        text="Choose a subject, tell us where you’re starting, and take it at your pace."
      />
      <section
        className="subject-cards"
        id="student-courses"
        aria-label="Your subjects"
      >
        {courseSubjects.map((subject) => {
          const saved = mine.find(
            (item) => item.data.subject === subject.id,
          )?.data;
          const topics = saved?.taughtTopics ?? [];
          return (
            <article
              className={`card subject-setup-card ${subject.id}`}
              key={subject.id}
            >
              <div className="subject-card-icon">
                <Icon name="Subjects" />
              </div>
              <p className="eyebrow">{saved ? "YOUR COURSE" : "A NEW START"}</p>
              <h2>{subject.label}</h2>
              <p className="muted">
                {saved
                  ? saved.targetSession
                  : subject.id === "psychology"
                    ? "Explore how people think, feel and behave."
                    : "Understand the decisions that shape a business."}
              </p>
              {saved ? (
                <div className="subject-course-summary">
                  <p>
                    {topics.length
                      ? `${topics.length} topics ready for practice`
                      : "Choose a topic to unlock practice"}
                  </p>
                  <p className="muted">
                    {saved.availability?.length
                      ? studyTimes(saved.availability)
                      : "Study whenever you’re ready. Add a routine anytime."}
                  </p>
                </div>
              ) : (
                <p className="subject-course-summary">
                  Tell us what you’re studying. We’ll help you find a place to
                  begin.
                </p>
              )}
              <div className="subject-card-actions">
                <button
                  type="button"
                  className={`button ${saved ? "secondary" : ""}`}
                  aria-label={`${saved ? "Edit" : "Add"} ${subject.label}`}
                  onClick={() => setEditing(subject.id)}
                >
                  <Icon name={saved ? "Edit" : "Plus"} />
                  {saved ? "Edit course" : `Add ${subject.label}`}
                </button>
                {saved && (
                  <button
                    type="button"
                    className="link-button"
                    aria-label={`Delete ${subject.label}`}
                    onClick={() => setRemoving(subject.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>
      {courseSubjects.map((subject) => (
        <CourseSetup
          key={`${learnerId}-${subject.id}`}
          subject={subject}
          enrolment={mine.find((item) => item.data.subject === subject.id)}
          papers={papers}
          familyId={familyId}
          learnerId={learnerId}
          open={editing === subject.id}
          onClose={() => setEditing(null)}
          run={run}
          refresh={refresh}
        />
      ))}
      {removingSubject && (
        <Dialog
          title={`Delete ${removingSubject.label}`}
          onClose={() => setRemoving(null)}
        >
          <p>
            Remove {removingSubject.label} for this student. It can be added
            again later.
          </p>
          <div className="row">
            <button
              className="button danger"
              type="button"
              onClick={() =>
                run(async () => {
                  await api("family/enrolment/delete", {
                    familyId,
                    learnerId,
                    subject: removingSubject.id,
                  });
                  setRemoving(null);
                  setEditing(null);
                  await refresh();
                })
              }
            >
              Delete course
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => setRemoving(null)}
            >
              Keep course
            </button>
          </div>
        </Dialog>
      )}
      <section className="card stack" style={{ marginTop: 24 }}>
        <h2>Reserved papers for {student?.name ?? "this student"}</h2>
        <p className="muted">
          The newest two complete papers per unit are reserved from ordinary
          practice. Releasing a paper makes its questions available and may
          reduce unseen mock options.
        </p>
        {papers
          .filter((p) => p.fullMockEligible)
          .map((p) => (
            <div className="row" key={p.id}>
              <span>
                {p.unit} · {p.session} {p.year}
              </span>
              <button
                className="button secondary small"
                onClick={() => setReleasing(p)}
              >
                Release for practice
              </button>
            </div>
          ))}
      </section>
      {releasing && (
        <Dialog
          title="Release paper for practice?"
          onClose={() => setReleasing(null)}
        >
          <p>
            This makes the questions available for ordinary practice and reduces
            your unseen mock options.
          </p>
          <Button
            onClick={() =>
              run(async () => {
                await api("family/action", {
                  familyId,
                  action: "release",
                  learnerId,
                  paperId: releasing.id,
                });
                setReleasing(null);
                await refresh();
              })
            }
          >
            Release paper
          </Button>
        </Dialog>
      )}
    </>
  );
}
export function Plan({
  familyId,
  learnerId,
  course,
  sessions,
  calendar,
  run,
  refresh,
  onAttempt,
}: {
  familyId: string;
  learnerId: string;
  course: any;
  sessions: any[];
  calendar: string;
  run: Run;
  refresh: () => Promise<void>;
  onAttempt: (id: string) => void;
}) {
  const [week, setWeek] = useState(new Date().toISOString().slice(0, 10));
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("");
  return (
    <>
      <PageHeading
        label="MY WEEK"
        title="Make time for focused work."
        text="Approve a manageable week. Missed work can move, while completed attempts always retain their actual submission date."
      />
      <section className="card row">
        <label className="field">
          Week starting
          <input
            type="date"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
          />
        </label>
        <button
          className="button"
          disabled={!course}
          onClick={() =>
            run(async () => {
              await api("family/plan/propose", {
                familyId,
                learnerId,
                enrolmentId: course.id,
                week,
              });
              await refresh();
            })
          }
        >
          Propose my week
        </button>
        <button
          className="button secondary"
          onClick={() =>
            run(async () => {
              if (calendar === "connected") {
                await api("calendar/disconnect", {});
                await refresh();
              } else {
                const r = await api("calendar/connect", {});
                location.assign(r.url);
              }
            })
          }
        >
          {calendar === "connected"
            ? "Disconnect Google Calendar"
            : "Connect Google Calendar"}
        </button>
      </section>
      <p className="muted" style={{ marginTop: 15 }}>
        Calendar connection: {calendar}. Only approved GotFoth sessions are
        published.
      </p>
      {sessions
        .filter((s) => s.learner_id === learnerId)
        .map((s) => (
          <section className="card" style={{ marginTop: 18 }} key={s.id}>
            <div className="row">
              <div>
                <span className="badge">{friendlyStatus(s.state)}</span>
                <h2 style={{ marginTop: 12 }}>{s.data.title}</h2>
                <p className="muted">
                  {new Date(s.data.start).toLocaleString()} · {s.data.minutes}{" "}
                  minutes
                </p>
                <p>{s.data.purpose}</p>
              </div>
              <div className="stack">
                {s.state === "proposed" ? (
                  <button
                    className="button"
                    onClick={() =>
                      run(async () => {
                        await api("family/plan/action", {
                          familyId,
                          id: s.id,
                          action: "approve",
                        });
                        await refresh();
                      })
                    }
                  >
                    Approve session
                  </button>
                ) : (
                  <button
                    className="button"
                    disabled={!s.data.attemptId}
                    onClick={() => onAttempt(s.data.attemptId)}
                  >
                    Open planned practice
                  </button>
                )}
                <button
                  className="link-button"
                  disabled={s.state === "completed"}
                  onClick={() => {
                    setRescheduling(s.id);
                    setStartTime("");
                  }}
                >
                  Reschedule
                </button>
                <button
                  className="link-button"
                  onClick={() =>
                    run(async () => {
                      await api("family/plan/action", {
                        familyId,
                        id: s.id,
                        action: "cancel",
                      });
                      await refresh();
                    })
                  }
                >
                  Remove session
                </button>
              </div>
            </div>
          </section>
        ))}
      {!sessions.length && (
        <Empty
          title="No sessions planned"
          text="Set your availability in My subjects, then propose a plan."
        />
      )}
      {rescheduling && (
        <Dialog
          title="Move this study session"
          onClose={() => setRescheduling(null)}
        >
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await api("family/plan/action", {
                  familyId,
                  id: rescheduling,
                  action: "reschedule",
                  start: new Date(startTime).toISOString(),
                });
                setRescheduling(null);
                await refresh();
              });
            }}
          >
            <label className="field">
              New date and time
              <input
                required
                type="datetime-local"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </label>
            <p className="muted">
              Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}{" "}
              (this device).
            </p>
            <Button>Save new time</Button>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function Assessment({
  familyId,
  id,
  reviewer,
  canQuery = false,
  run,
  onBack,
  onRetry,
}: {
  familyId: string;
  id: string;
  reviewer: boolean;
  canQuery?: boolean;
  run: Run;
  onBack: () => void;
  onRetry?: (id: string, topic: string, subject?: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [results, setResults] = useState(""),
    [reason, setReason] = useState(""),
    [choices, setChoices] = useState<string[]>([]);
  useEffect(() => {
    run(async () => {
      const r = await api(`family/assessment?family=${familyId}&id=${id}`);
      setData(r);
      setChoices(r.provenance?.resolvedChoices ?? r.submission.choices);
      setResults(
        JSON.stringify(
          r.effective ??
            (r.candidates?.length
              ? r.candidates.map((c: any) => c.primary)
              : r.questions
                  .filter(
                    (q: any) =>
                      q.rubric &&
                      (!q.choiceGroup ||
                        (
                          r.provenance?.resolvedChoices ?? r.submission.choices
                        ).includes(q.id)),
                  )
                  .map((q: any) => ({
                    questionId: q.id,
                    rubricId: q.rubric.id,
                    awarded: 0,
                    available: q.marks,
                    evidence: [],
                    justification: "",
                    achievements: [],
                    improvement: "",
                    uncertainty: [],
                  }))),
          null,
          2,
        ),
      );
    });
  }, [familyId, id]);
  if (!data) return <p>Loading assessment…</p>;
  async function decide(action: string) {
    await api("family/review", {
      familyId,
      assessmentId: data.id,
      action,
      reason,
      choices: action === "resolve_choices" ? choices : undefined,
      results: action === "publish" ? JSON.parse(results) : undefined,
    });
    onBack();
  }
  return (
    <>
      <button className="link-button" onClick={onBack}>
        ← Back
      </button>
      <PageHeading
        label={`FEEDBACK · ${friendlyStatus(data.state)}`}
        title={
          reviewer
            ? "Review the work. Shape the next step."
            : data.state === "published"
              ? "See what’s working. Find your next step."
              : "Your feedback is being checked."
        }
        text={`Submitted ${date(data.submission.submitted_at)}. Your original response is preserved.`}
      />
      {data.state === "published" && (
        <ResultSummary
          data={data}
          onRetry={
            onRetry
              ? (id, topic) => onRetry(id, topic, data.subject)
              : undefined
          }
        />
      )}
      <div className={`assessment-workspace ${reviewer ? "is-review" : ""}`}>
        <div>
          {data.questions.map((q: any) => {
            const result = data.effective?.find(
              (r: any) => r.questionId === q.id,
            );
            return (
              <section
                className="feedback-section stack"
                key={q.id}
                style={{ marginBottom: 20 }}
              >
                <div className="row">
                  <h2>Question {q.number}</h2>
                  <span className="badge">
                    {result ? `${result.awarded} / ` : ""}
                    {q.marks} marks
                  </span>
                </div>
                <p className="question-text">{q.text}</p>
                <QuestionExtracts extracts={q.extracts ?? []} reveal />
                <details open={reviewer}>
                  <summary>Submitted answer</summary>
                  <p className="question-text">
                    {data.submission.answers.find(
                      (a: any) => a.question_id === q.id,
                    )?.text || "(Blank)"}
                  </p>
                </details>
                {result && (
                  <>
                    <div className="feedback-win">
                      <h3>What worked</h3>
                      {result.achievements.map((a: string, i: number) => (
                        <p key={i}>{a}</p>
                      ))}
                    </div>
                    <div className="notice">
                      <strong>
                        {result.awarded < result.available
                          ? "Where to gain marks"
                          : "Keep building on this"}
                      </strong>
                      <p>{result.improvement}</p>
                    </div>
                    <p className="muted">{result.justification}</p>
                    {onRetry && (
                      <button
                        className="button secondary"
                        onClick={() =>
                          onRetry(data.id, q.topics[0], data.subject)
                        }
                      >
                        Practise an improvement
                      </button>
                    )}
                  </>
                )}
                {q.rubric && (
                  <details open={reviewer}>
                    <summary>Approved marking rubric</summary>
                    <p className="question-text">{q.rubric.text}</p>
                  </details>
                )}
                {reviewer &&
                  data.candidates
                    ?.filter((c: any) => c.primary.questionId === q.id)
                    .map((c: any, i: number) => (
                      <div className="grid" key={i}>
                        {[c.primary, c.reviewer]
                          .filter(Boolean)
                          .map((r: any, j: number) => (
                            <section className="source" key={j}>
                              <strong>
                                {j ? "Independent reviewer" : "Primary marker"}{" "}
                                · {r.awarded}/{r.available}
                              </strong>
                              <p>{r.justification}</p>
                              <button
                                className="button secondary small"
                                onClick={() => {
                                  const current = JSON.parse(results);
                                  setResults(
                                    JSON.stringify(
                                      [
                                        ...current.filter(
                                          (x: any) =>
                                            x.questionId !== r.questionId,
                                        ),
                                        r,
                                      ],
                                      null,
                                      2,
                                    ),
                                  );
                                }}
                              >
                                Use this assessment
                              </button>
                              {r.evidence.map((e: any, k: number) => (
                                <p key={k}>
                                  “{e.quote}”<br />
                                  Rubric: {e.rubricReference}
                                </p>
                              ))}
                            </section>
                          ))}
                      </div>
                    ))}
              </section>
            );
          })}
        </div>
        {(reviewer || canQuery) && (
          <section
            className={`card stack ${reviewer ? "review-decision" : ""}`}
          >
            <h2>{reviewer ? "Review decision" : "Query this result"}</h2>
            {reviewer && data.decisions?.length > 0 && (
              <details
                open={data.decisions.some(
                  (d: any) => d.data.action === "query",
                )}
              >
                <summary>Questions and decision history</summary>
                {data.decisions.map((d: any, i: number) => (
                  <article className="review-history" key={i}>
                    <strong>
                      {d.data.action === "query"
                        ? "Student question"
                        : "Recorded decision"}
                    </strong>
                    <small className="meta"> · {date(d.created_at)}</small>
                    <p>{d.data.reason}</p>
                  </article>
                ))}
              </details>
            )}
            <div>
              {reviewer && data.error_code === "INVALID_CHOICES" && (
                <section className="notice">
                  <h3>Resolve the saved question choices</h3>
                  <p>
                    Select the intended permitted route, with a reason below.
                    The original saved choices remain in the submission.
                  </p>
                  {data.choiceGroups.map((g: any) => (
                    <fieldset key={g.id}>
                      <legend>
                        {g.id}: choose {g.choose}
                      </legend>
                      {g.questionIds.map((qid: string) => (
                        <label key={qid} style={{ display: "block" }}>
                          <input
                            type="checkbox"
                            checked={choices.includes(qid)}
                            onChange={(e) =>
                              setChoices(
                                e.target.checked
                                  ? [...choices, qid]
                                  : choices.filter((x) => x !== qid),
                              )
                            }
                          />{" "}
                          Question{" "}
                          {
                            data.questions.find((q: any) => q.id === qid)
                              ?.number
                          }
                        </label>
                      ))}
                    </fieldset>
                  ))}
                  <button
                    className="button secondary"
                    disabled={reason.length < 5}
                    onClick={() => run(() => decide("resolve_choices"))}
                  >
                    Record resolved choices
                  </button>
                </section>
              )}
            </div>
            <label className="field">
              Reason
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain the rubric-supported decision or your question."
              />
            </label>
            {reviewer && <ResultEditor value={results} onChange={setResults} />}
            <div className="row">
              {reviewer ? (
                <>
                  <button
                    className="button"
                    disabled={reason.length < 5}
                    onClick={() => run(() => decide("publish"))}
                  >
                    Publish supported result
                  </button>
                  <button
                    className="button secondary"
                    disabled={reason.length < 5}
                    onClick={() => run(() => decide("reprocess"))}
                  >
                    Reprocess
                  </button>
                  <button
                    className="link-button"
                    disabled={reason.length < 5}
                    onClick={() => run(() => decide("unresolvable"))}
                  >
                    Mark unresolvable
                  </button>
                </>
              ) : (
                <button
                  className="button"
                  disabled={reason.length < 5 || data.state !== "published"}
                  onClick={() => run(() => decide("query"))}
                >
                  Ask your teacher to review
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function ResultSummary({
  data,
  onRetry,
}: {
  data: any;
  onRetry?: (id: string, topic: string) => void;
}) {
  const total = score(data.effective);
  if (!total) return null;
  const missed = [...data.effective]
    .filter((r: any) => r.awarded < r.available)
    .sort(
      (a: any, b: any) => b.available - b.awarded - (a.available - a.awarded),
    );
  const next = missed
    .map((r: any) => ({
      result: r,
      question: data.questions.find((q: any) => q.id === r.questionId),
    }))
    .find((item: any) => item.question?.topics?.length);
  return (
    <>
      <section className="feedback-lead">
        <p className="eyebrow">BUILD ON WHAT WORKED</p>
        <h2>A little clearer. A little further.</h2>
        {data.effective
          .flatMap((r: any) => r.achievements ?? [])
          .slice(0, 2)
          .map((text: string, i: number) => (
            <p key={i}>{text}</p>
          ))}
        <h3>Your next improvement</h3>
        <p>
          {next?.result.improvement ||
            "Keep practising independently to build on this result."}
        </p>
      </section>
      <section className="score-summary" aria-label="Result summary">
        <div>
          <p className="eyebrow">REVIEWED SCORE</p>
          <div className="score-big">
            {total.percentage}
            <small>%</small>
          </div>
          <p className="meta">
            {total.awarded} / {total.available} marks
          </p>
          <Meter
            value={total.awarded}
            max={total.available}
            label="Marks earned"
          />
        </div>
        <div>
          <h2>Opportunities to improve</h2>
          {missed.length ? (
            missed.map((r: any) => (
              <div className="lost-row" key={r.questionId}>
                <div>
                  <strong>
                    Question{" "}
                    {data.questions.find((q: any) => q.id === r.questionId)
                      ?.number ?? r.questionId}
                  </strong>
                  <p>{r.improvement || r.justification}</p>
                </div>
                <strong>{r.available - r.awarded} marks</strong>
              </div>
            ))
          ) : (
            <p>All available marks earned on this submission.</p>
          )}
          <p className="meta">
            These are question-level marks, not a qualification grade or a topic
            mastery estimate.
          </p>
        </div>
      </section>
      {next && onRetry && (
        <section className="result-next row">
          <div>
            <p className="eyebrow">RECOMMENDED NEXT STEP</p>
            <h2>Work on one improvement.</h2>
            <p className="meta">
              {next.result.improvement ||
                "Return to this topic with a separate assisted attempt."}
            </p>
          </div>
          <Button onClick={() => onRetry(data.id, next.question.topics[0])}>
            Practise this improvement →
          </Button>
        </section>
      )}
    </>
  );
}
function ResultEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  let results: any[];
  try {
    results = JSON.parse(value);
  } catch {
    return (
      <p className="error">
        Correct the structured result before editing marks.
      </p>
    );
  }
  function update(index: number, patch: object) {
    onChange(
      JSON.stringify(
        results.map((r, i) => (i === index ? { ...r, ...patch } : r)),
        null,
        2,
      ),
    );
  }
  return (
    <div className="stack">
      {results.map((r, i) => (
        <fieldset className="card stack" key={r.questionId}>
          <legend>Selected assessment · {r.questionId}</legend>
          <label className="field">
            Awarded marks (of {r.available})
            <input
              type="number"
              min="0"
              max={r.available}
              step="1"
              value={r.awarded}
              onChange={(e) => update(i, { awarded: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            Rubric-supported justification
            <textarea
              value={r.justification}
              onChange={(e) => update(i, { justification: e.target.value })}
            />
          </label>
          <label className="field">
            One manageable improvement
            <textarea
              value={r.improvement}
              onChange={(e) => update(i, { improvement: e.target.value })}
            />
          </label>
          {r.evidence.map((ev: any, j: number) => (
            <div className="form-grid" key={j}>
              <label className="field">
                Exact answer quotation
                <input
                  value={ev.quote}
                  onChange={(e) =>
                    update(i, {
                      evidence: r.evidence.map((v: any, k: number) =>
                        k === j ? { ...v, quote: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
              <label className="field">
                Exact supporting rubric text
                <input
                  value={ev.rubricReference}
                  onChange={(e) =>
                    update(i, {
                      evidence: r.evidence.map((v: any, k: number) =>
                        k === j ? { ...v, rubricReference: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
            </div>
          ))}
          <button
            className="button secondary small"
            onClick={() =>
              update(i, {
                evidence: [...r.evidence, { quote: "", rubricReference: "" }],
              })
            }
          >
            Add supporting evidence
          </button>
        </fieldset>
      ))}
    </div>
  );
}
