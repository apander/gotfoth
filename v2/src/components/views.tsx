"use client";
import { useEffect, useRef, useState } from "react";
import { api, date } from "./api";
import { PageHeading, Empty } from "./ui";
import { Button, Meter } from "./ui";
import { score } from "./revision";
import { ScheduleFields } from "./schedule-fields";
type Run = (fn: () => Promise<void>) => void;
const examMonths = ["January", "June", "October"] as const;
function examSessionChoices(now = new Date()) {
  const start = now.getFullYear();
  return Array.from({ length: 4 }, (_, index) => start + index).flatMap((year) =>
    examMonths.map((month) => `${month} ${year}`),
  );
}
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
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Practice conditions
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="">Independent attempts</option>
              {["guided", "independent", "timed", "mock"].map((m) => (
                <option key={m}>{m}</option>
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
            <h2>{topic}</h2>
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
export function FamilySettings({
  familyId,
  learners,
  enrolments,
  papers,
  run,
  refresh,
}: {
  familyId: string;
  learners: any[];
  enrolments: any[];
  papers: any[];
  run: Run;
  refresh: () => Promise<void>;
}) {
  const [learner, setLearner] = useState(learners[0]?.id ?? ""),
    [subject, setSubject] = useState("psychology"),
    [session, setSession] = useState(""),
    [spec, setSpec] = useState(""),
    [topics, setTopics] = useState(""),
    [option, setOption] = useState(""),
    [extra, setExtra] = useState(0),
    [timezone, setTimezone] = useState(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
    [availability, setAvailability] = useState(
      '[{"day":1,"start":"17:00","minutes":20},{"day":4,"start":"17:00","minutes":20}]',
    ),
    [examDates, setExamDates] = useState("[]");
  useEffect(() => {
    const e = enrolments.find(
      (e) => e.learner_id === learner && e.data.subject === subject,
    )?.data;
    setSession(e?.targetSession ?? "");
    setSpec(e?.specification ?? "");
    setTopics(e?.taughtTopics.join("\n") ?? "");
    setOption(e?.option ?? "");
    setExtra(e?.extraTimePercent ?? 0);
    if (e) {
      setTimezone(e.timezone);
      setAvailability(JSON.stringify(e.availability, null, 2));
      setExamDates(JSON.stringify(e.examDates, null, 2));
    }
  }, [learner, subject]);
  const sessions = examSessionChoices();
  return (
    <>
      <PageHeading
        label="FAMILY SETTINGS"
        title="Course settings."
        text="Course settings determine eligible questions, timing allowances, and the study plan."
      />
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api("family/enrolment", {
              familyId,
              learnerId: learner,
              course: {
                subject,
                specification: spec,
                targetSession: session,
                taughtTopics: topics
                  .split("\n")
                  .map((t) => t.trim())
                  .filter(Boolean),
                option: option || undefined,
                timezone,
                extraTimePercent: extra,
                sessionMinutes: 20,
                availability: JSON.parse(availability),
                examDates: JSON.parse(examDates),
                blockedDates: [],
              },
            });
            await refresh();
          });
        }}
      >
        <div className="form-grid">
          <label className="field">
            Learner
            <select
              value={learner}
              onChange={(e) => setLearner(e.target.value)}
            >
              {learners.map((l) => (
                <option value={l.id} key={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Subject
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option value="psychology">Psychology · YPS01</option>
              <option value="business">Business · YBS11</option>
            </select>
          </label>
          <label className="field">
            Target exam session
            <select
              required
              value={sessions.includes(session) ? session : ""}
              onChange={(e) => setSession(e.target.value)}
            >
              <option value="">Choose a session</option>
              {sessions.map((choice) => (
                <option value={choice} key={choice}>
                  {choice}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Specification version
            <input
              required
              list="specifications"
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
            />
            <datalist id="specifications">
              {[
                ...new Set(
                  papers
                    .filter((p) => p.subject === subject)
                    .flatMap((p) => p.compatibleSpecifications),
                ),
              ].map((s) => (
                <option key={String(s)} value={String(s)} />
              ))}
            </datalist>
          </label>
          <label className="field">
            Psychology Unit 3 option
            <select value={option} onChange={(e) => setOption(e.target.value)}>
              <option value="">Not selected</option>
              <option value="health">Health psychology</option>
              <option value="criminological">Criminological psychology</option>
            </select>
          </label>
          <label className="field">
            Extra-time allowance (%)
            <input
              type="number"
              min="0"
              max="100"
              value={extra}
              onChange={(e) => setExtra(Number(e.target.value))}
            />
          </label>
          <label className="field">
            Time zone
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          Taught topic identifiers · one per line
          <textarea
            required
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
            placeholder="Use the reviewed catalogue’s syllabus topic identifiers."
          />
        </label>
        <details>
          <summary>Weekly availability and confirmed exam dates</summary>
          <ScheduleFields
            kind="availability"
            value={availability}
            onChange={setAvailability}
          />
          <ScheduleFields
            kind="exams"
            value={examDates}
            onChange={setExamDates}
          />
        </details>
        <button className="button" type="submit">
          Save course settings
        </button>
      </form>
      <section className="card stack" style={{ marginTop: 24 }}>
        <h2>Reserved papers</h2>
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
                onClick={() =>
                  run(async () => {
                    if (
                      confirm(
                        "Release this reserved paper into ordinary practice?",
                      )
                    )
                      await api("family/action", {
                        familyId,
                        action: "release",
                        learnerId: learner,
                        paperId: p.id,
                      });
                  })
                }
              >
                Release for practice
              </button>
            </div>
          ))}
      </section>
      <section className="card" style={{ marginTop: 24 }}>
        <h2>Your family’s data</h2>
        <div className="row">
          <button
            className="button secondary"
            onClick={() =>
              run(async () => {
                const result = await api("family/action", {
                  familyId,
                  action: "export",
                });
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(result, null, 2)], {
                    type: "application/json",
                  }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = "study-vault-export.json";
                link.click();
                URL.revokeObjectURL(url);
              })
            }
          >
            Export linked learners’ records
          </button>
          <button
            className="link-button"
            onClick={() =>
              run(async () => {
                if (
                  prompt(
                    "Type DELETE FAMILY to request removal of this family’s records within 30 days.",
                  ) === "DELETE FAMILY"
                ) {
                  await api("family/action", {
                    familyId,
                    action: "delete",
                    confirmation: "DELETE FAMILY",
                  });
                  location.reload();
                }
              })
            }
          >
            Request family deletion
          </button>
        </div>
      </section>
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
  return (
    <>
      <PageHeading
        label="PLAN"
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
        Calendar connection: {calendar}. Only approved Study Vault sessions are
        published.
      </p>
      {sessions
        .filter((s) => s.learner_id === learnerId)
        .map((s) => (
          <section className="card" style={{ marginTop: 18 }} key={s.id}>
            <div className="row">
              <div>
                <span className="badge">{s.state}</span>
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
                  onClick={() =>
                    run(async () => {
                      const start = prompt(
                        "New date and time, including time zone (example: 2027-01-15T17:00:00+01:00)",
                      );
                      if (start) {
                        await api("family/plan/action", {
                          familyId,
                          id: s.id,
                          action: "reschedule",
                          start: new Date(start).toISOString(),
                        });
                        await refresh();
                      }
                    })
                  }
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
          text="Add availability in Family settings, then propose a plan."
        />
      )}
    </>
  );
}
export function Assessment({
  familyId,
  id,
  parent,
  run,
  onBack,
  onRetry,
}: {
  familyId: string;
  id: string;
  parent: boolean;
  run: Run;
  onBack: () => void;
  onRetry: (id: string, topic: string) => void;
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
  }, [id]);
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
        label={`FEEDBACK · ${data.state.replaceAll("_", " ")}`}
        title={
          data.state === "published"
            ? "The marks. The next move."
            : "Your feedback is being checked."
        }
        text={`Submitted ${date(data.submission.submitted_at)}. Your original response is preserved.`}
      />
      {data.state === "published" && (
        <ResultSummary data={data} onRetry={onRetry} />
      )}
      {data.questions.map((q: any) => {
        const result = data.effective?.find((r: any) => r.questionId === q.id);
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
            <details>
              <summary>Your submitted answer</summary>
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
                <button
                  className="button secondary"
                  onClick={() => onRetry(data.id, q.topics[0])}
                >
                  Practise an improvement
                </button>
              </>
            )}
            {q.rubric && (
              <details>
                <summary>Approved marking rubric</summary>
                <p className="question-text">{q.rubric.text}</p>
              </details>
            )}
            {parent &&
              data.candidates
                ?.filter((c: any) => c.primary.questionId === q.id)
                .map((c: any, i: number) => (
                  <div className="grid" key={i}>
                    {[c.primary, c.reviewer]
                      .filter(Boolean)
                      .map((r: any, j: number) => (
                        <section className="source" key={j}>
                          <strong>
                            {j ? "Independent reviewer" : "Primary marker"} ·{" "}
                            {r.awarded}/{r.available}
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
                                      (x: any) => x.questionId !== r.questionId,
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
      <section className="card stack">
        <h2>{parent ? "Review decision" : "Query this result"}</h2>
        <div>
          {parent && data.error_code === "INVALID_CHOICES" && (
            <section className="notice">
              <h3>Resolve the saved question choices</h3>
              <p>
                Select the intended permitted route, with a reason below. The
                original saved choices remain in the submission.
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
                      {data.questions.find((q: any) => q.id === qid)?.number}
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
        {parent && <ResultEditor value={results} onChange={setResults} />}
        {parent && (
          <details>
            <summary>
              Effective assessments · editable structured result
            </summary>
            <label className="field">
              <span className="sr-only">Assessment results JSON</span>
              <textarea
                className="json-editor"
                value={results}
                onChange={(e) => setResults(e.target.value)}
              />
            </label>
          </details>
        )}
        <div className="row">
          {parent ? (
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
              Ask a parent to review
            </button>
          )}
        </div>
      </section>
    </>
  );
}

function ResultSummary({
  data,
  onRetry,
}: {
  data: any;
  onRetry: (id: string, topic: string) => void;
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
          <h2>Where you lost marks</h2>
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
      {next && (
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
