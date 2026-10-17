"use client";
import { useState } from "react";
import { date } from "./api";
import { Button, Empty, Icon, PageHeading, Status } from "./ui";

export function score(results: any[] | null | undefined) {
  if (!results?.length) return null;
  const awarded = results.reduce((n, r) => n + Number(r.awarded), 0),
    available = results.reduce((n, r) => n + Number(r.available), 0);
  return available > 0
    ? {
        awarded,
        available,
        percentage: Math.round((100 * awarded) / available),
      }
    : null;
}
export function Home({
  data,
  learner,
  selected,
  busy,
  onAttempt,
  onAssessment,
  onCreate,
  onPage,
}: any) {
  const attempts = data.attempts.filter((a: any) => a.learner_id === learner);
  const open = attempts.filter((a: any) =>
    ["draft", "in_progress"].includes(a.state),
  );
  const next = open[0];
  const results = data.assessments.filter((a: any) => a.learner_id === learner);
  const published = results.filter((a: any) => a.state === "published");
  const latest = published[0],
    latestScore = score(latest?.effective);
  const courseReady = !!selected;
  return (
    <>
      <PageHeading
        label="YOUR WORKSPACE"
        title="Back to work."
        text="Real questions. Focused practice. Every mark counts."
      />
      <section className="continuation" aria-label="Next revision action">
        <div className="continuation-top">
          <Status>
            {next
              ? "IN PROGRESS"
              : courseReady
                ? "READY WHEN YOU ARE"
                : "SETUP NEEDED"}
          </Status>
          <span className="muted">
            {next ? date(next.created_at) : "PAST-PAPER PRACTICE"}
          </span>
        </div>
        <h2>
          {next
            ? "Continue revision"
            : courseReady
              ? "Start with one question."
              : "Your next session starts here."}
        </h2>
        <p>
          {next
            ? `${next.subject ?? "Revision"} · ${next.mode} · ${next.state === "draft" ? "Ready to start" : "Session in progress"}`
            : courseReady
              ? `${selected.data.subject} · About 10 minutes, using topics you have covered.`
              : "Set up a course and the topics you have covered before the first session."}
        </p>
        <div className="row">
          <Button
            disabled={busy}
            onClick={() =>
              next
                ? onAttempt(next.id)
                : courseReady
                  ? onCreate("guided")
                  : onPage("Study")
            }
          >
            {next
              ? "Continue revision"
              : courseReady
                ? "Start revision"
                : "Set up a course"}
            <Icon name="Arrow" />
          </Button>
          <button className="link-button" onClick={() => onPage("Practice")}>
            Choose a different session
          </button>
        </div>
      </section>
      <div className="home-columns">
        <section className="section">
          <div className="section-title">
            <h2>Recent work</h2>
            <span className="muted">{attempts.length} recent sessions</span>
          </div>
          {open.slice(0, 3).map((a: any) => (
            <div className="list-item row" key={a.id}>
              <div>
                <strong className="capitalize">
                  {a.subject ?? "Revision"} · {a.mode}
                </strong>
                <p className="meta">
                  {date(a.created_at)} · {a.state.replaceAll("_", " ")}
                </p>
              </div>
              <Button
                variant="secondary"
                className="small"
                onClick={() => onAttempt(a.id)}
              >
                Continue
              </Button>
            </div>
          ))}
          {results.slice(0, 4).map((a: any) => {
            const s = score(a.effective);
            return (
              <div className="list-item row" key={a.id}>
                <div>
                  <strong>
                    {a.state === "published"
                      ? "Feedback ready"
                      : a.state.replaceAll("_", " ")}
                  </strong>
                  <p className="meta">
                    {date(a.submitted_at)} · {a.mode}
                  </p>
                </div>
                <button
                  className="result-link"
                  onClick={() => onAssessment(a.id)}
                >
                  {s ? `${s.awarded}/${s.available}` : "View"}
                  <Icon name="Arrow" />
                </button>
              </div>
            );
          })}
          {!open.length && !results.length && (
            <p className="empty-inline">
              No sessions yet. Your answers and feedback will appear here.
            </p>
          )}
        </section>
        <aside className="context-panel">
          <p className="eyebrow">BEST NEXT STEP</p>
          <h2>
            {latest ? "Turn feedback into marks." : "Build a useful baseline."}
          </h2>
          <p className="muted">
            {latest
              ? "Review your latest marked answers and choose one improvement to practise."
              : "Answer a short set first. Recommendations become more useful as reviewed results arrive."}
          </p>
          <Button
            variant="secondary"
            disabled={busy || (!latest && !courseReady)}
            onClick={() =>
              latest ? onAssessment(latest.id) : onCreate("guided")
            }
          >
            {latest ? "Review latest feedback" : "Practice 10 min"}
            <Icon name="Arrow" />
          </Button>
          <div className="compact-stat">
            <span className="eyebrow">LATEST REVIEWED RESULT</span>
            <strong>{latestScore ? `${latestScore.percentage}%` : "—"}</strong>
            <span className="meta">
              {latestScore
                ? `${latestScore.awarded} of ${latestScore.available} marks · ${date(latest.submitted_at)}`
                : "No published assessments yet"}
            </span>
          </div>
          {selected && (
            <div className="list-item">
              <span className="eyebrow">EXAM TARGET</span>
              <p>{selected.data.targetSession}</p>
              <span className="meta">
                {selected.data.taughtTopics.length} taught topics ·{" "}
                <span className="capitalize">{selected.data.subject}</span>
              </span>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

export function PracticePicker({ selected, busy, onCreate, onPapers }: any) {
  const [mode, setMode] = useState("guided");
  const modes = [
    [
      "guided",
      "Guided practice",
      "~10 min",
      "Hints on request. Feedback after each answer.",
    ],
    [
      "independent",
      "Independent set",
      "~20 min",
      "Work through a set, then review your answers.",
    ],
    [
      "timed",
      "Timed section",
      "Estimated duration",
      "A fixed deadline. Feedback after submission.",
    ],
  ];
  return (
    <>
      <PageHeading
        label="PRACTICE"
        title="Choose your conditions."
        text="The questions stay real. You choose how to practise."
      />
      <section className="practice-builder">
        <fieldset className="mode-list">
          <legend>Practice mode</legend>
          {modes.map(([key, title, time, description]) => (
            <label
              className={`mode-row ${mode === key ? "selected" : ""}`}
              key={key}
            >
              <input
                type="radio"
                name="practice-mode"
                value={key}
                checked={mode === key}
                onChange={() => setMode(key)}
              />
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
              <span className="meta">{time}</span>
            </label>
          ))}
        </fieldset>
        <div className="row action-bar">
          <span className="muted">
            {selected
              ? `${selected.data.subject} · Taught topics only`
              : "Add a course in My subjects first."}
          </span>
          <Button disabled={!selected || busy} onClick={() => onCreate(mode)}>
            Start practice
            <Icon name="Arrow" />
          </Button>
        </div>
      </section>
      <div className="list-item row">
        <div>
          <h2>Ready for the whole paper?</h2>
          <p className="muted">
            Original instructions, question choices and timing.
          </p>
        </div>
        <Button variant="secondary" onClick={onPapers}>
          Browse papers
        </Button>
      </div>
    </>
  );
}

export function PaperList({ papers, selected, learner, busy, onCreate }: any) {
  const eligible = papers.filter(
    (p: any) =>
      p.fullMockEligible &&
      p.subject === selected?.data.subject &&
      p.compatibleSpecifications.includes(selected?.data.specification),
  );
  return (
    <>
      {eligible.length ? (
        <div className="paper-list">
          {eligible.map((p: any) => (
            <article className="paper-row" key={p.id}>
              <div className="paper-year">
                <strong>{p.year}</strong>
                <span>{p.session}</span>
              </div>
              <div className="paper-description">
                <h2>{p.title}</h2>
                <p className="meta">
                  {p.unit} · {p.durationMinutes} min · {p.totalMarks} marks
                </p>
              </div>
              <Status>
                {p.exposedLearnerIds?.includes(learner)
                  ? "Previously seen"
                  : "Unseen"}
              </Status>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => onCreate("mock", p.id)}
              >
                Prepare mock
                <Icon name="Arrow" />
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No compatible papers yet"
          text="Complete, reviewed papers for this course will appear here. You can still use eligible questions in practice."
        />
      )}
    </>
  );
}

export function Subjects({
  data,
  learner,
  selected,
  onSelect,
  onPractice,
  onTopic,
  onHistory,
  busy,
}: any) {
  const [tab, setTab] = useState("papers");
  const courses = data.enrolments.filter((c: any) => c.learner_id === learner);
  return (
    <>
      <PageHeading
        label="MY SUBJECTS"
        title="Your subjects. Your possibilities."
        text="Your courses, past papers and taught topics in one place."
      />
      <div className="subject-switch" aria-label="Choose subject">
        {courses.map((c: any) => (
          <button
            className={`subject-button ${c.id === selected?.id ? "selected" : ""}`}
            aria-pressed={c.id === selected?.id}
            onClick={() => onSelect(c.id)}
            key={c.id}
          >
            <Icon name="Subjects" />
            <span>
              <strong className="capitalize">{c.data.subject}</strong>
              <small>
                {c.data.targetSession} · {c.data.taughtTopics.length} taught
                topics
              </small>
            </span>
          </button>
        ))}
      </div>
      {!courses.length ? (
        <Empty
          title="Add your first course"
          text="Set up Psychology or Business in My subjects, including the topics you have covered."
        />
      ) : (
        <>
          <div className="segmented" role="group" aria-label="Subject view">
            <button
              aria-pressed={tab === "papers"}
              onClick={() => setTab("papers")}
            >
              Past papers
            </button>
            <button
              aria-pressed={tab === "topics"}
              onClick={() => setTab("topics")}
            >
              Topics
            </button>
          </div>
          {tab === "papers" ? (
            <PaperList
              papers={data.papers}
              selected={selected}
              learner={learner}
              busy={busy}
              onCreate={onPractice}
            />
          ) : (
            <section>
              {selected?.data.taughtTopics.length ? (
                selected.data.taughtTopics.map((topic: string) => (
                  <div className="list-item row" key={topic}>
                    <div>
                      <strong>
                        {topic.replaceAll(".", " / ").replaceAll("_", " ")}
                      </strong>
                      <p className="meta">
                        Taught topic · reviewed questions only
                      </p>
                    </div>
                    <div className="row">
                      <button
                        className="link-button"
                        onClick={() => onHistory(topic)}
                      >
                        History
                      </button>
                      <Button
                        variant="secondary"
                        className="small"
                        disabled={busy}
                        onClick={() => onTopic(topic)}
                      >
                        Practise
                        <Icon name="Arrow" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <Empty
                  title="No taught topics selected"
                  text="Add the topics you have covered in My subjects."
                />
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
