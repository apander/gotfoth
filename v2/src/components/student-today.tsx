"use client";
import { useEffect, useState } from "react";
import { api, date } from "./api";
import { Button, Dialog, Empty, Icon, PageHeading } from "./ui";
import { StudyCompanion } from "./persona-shell";
import { friendlyStatus, learnerStatus } from "../lib/personas";

export function StudentToday({
  data,
  familyId,
  learner,
  selected,
  busy,
  celebrate,
  onAttempt,
  onAssessment,
  onCreate,
  onPage,
}: any) {
  const [motivation, setMotivation] = useState<any>(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [goal, setGoal] = useState(3),
    [timezone, setTimezone] = useState("UTC"),
    [saving, setSaving] = useState(false),
    [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    let alive = true;
    api(`family/motivation?family=${familyId}&learner=${learner}`)
      .then((value) => {
        if (!alive) return;
        setMotivation(value);
        setGoal(value.goal);
        setTimezone(value.timezone);
        const key = `gotfoth:celebrated:${learner}`;
        if (value.latestAttemptId) {
          if (celebrate && localStorage.getItem(key) !== value.latestAttemptId)
            setCelebrating(true);
          localStorage.setItem(key, value.latestAttemptId);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [familyId, learner, data, celebrate]);
  const open = data.attempts.filter(
    (a: any) =>
      a.learner_id === learner && ["draft", "in_progress"].includes(a.state),
  );
  const planned = data.sessions.find(
    (s: any) =>
      s.learner_id === learner &&
      s.state === "approved" &&
      s.data.attemptId &&
      !data.attempts.some(
        (a: any) => a.id === s.data.attemptId && a.state === "submitted",
      ),
  );
  const next =
    open.find((a: any) => a.state === "in_progress") ??
    open.find(
      (a: any) =>
        !data.sessions.some(
          (s: any) => s.state === "approved" && s.data.attemptId === a.id,
        ),
    );
  const published = data.assessments.filter(
    (a: any) => a.learner_id === learner && a.state === "published",
  );
  const pending = data.assessments.filter(
    (a: any) =>
      a.learner_id === learner &&
      a.state !== "published" &&
      a.state !== "cancelled",
  );
  const name =
    data.learners.find((l: any) => l.id === learner)?.name?.split(" ")[0] ??
    "there";
  return (
    <>
      <PageHeading
        label="A LITTLE PRACTICE GOES A LONG WAY"
        title={`Your next step, ${name}.`}
        text="You don't have to do it all today. Just start somewhere."
      />
      <section className="student-hero" aria-label="Next revision action">
        <div>
          <span className="badge">
            {next
              ? "PICK UP WHERE YOU LEFT OFF"
              : planned
                ? "ON YOUR PLAN"
                : selected
                  ? "YOU’VE GOT THIS"
                  : "LET’S GET YOU STARTED"}
          </span>
          <h2>
            {next
              ? "Ready for another little win?"
              : planned
                ? planned.data.title
                : selected
                  ? "One question. A little more confidence."
                  : "Make this space yours."}
          </h2>
          <p>
            {next
              ? `${next.subject ?? "Your subject"} · ${friendlyStatus(next.mode)}${next.duration_minutes ? ` · ${next.duration_minutes} minutes planned` : ""}. Your saved work is waiting.`
              : planned
                ? `${planned.data.minutes} minutes · ${planned.data.purpose}`
                : selected
                  ? `${selected.data.subject} · About 10 minutes, using topics you’ve already covered.`
                  : "Add your subjects and the topics you’ve covered. We’ll help you find a good place to begin."}
          </p>
          <div className="row hero-actions">
            <Button
              disabled={busy}
              onClick={() =>
                next
                  ? onAttempt(next.id)
                  : planned
                    ? onAttempt(planned.data.attemptId)
                    : selected
                      ? onCreate("guided")
                      : onPage("Study")
              }
            >
              {next
                ? "Continue revision"
                : planned
                  ? "Start planned practice"
                  : selected
                    ? "Start revision"
                    : "Set up a course"}
              <Icon name="Arrow" />
            </Button>
            {selected && (
              <button
                className="link-button"
                onClick={() => onPage("Practice")}
              >
                Choose something else
              </button>
            )}
          </div>
        </div>
        <StudyCompanion />
      </section>
      {celebrating && (
        <section className="completion-banner" role="status">
          <StudyCompanion celebrate />
          <div>
            <h2>That’s another step forward.</h2>
            <p>
              Your practice counts. Take a breath, then come back when you’re
              ready.
            </p>
          </div>
          <button className="link-button" onClick={() => setCelebrating(false)}>
            Dismiss
          </button>
        </section>
      )}
      <div className="student-dashboard-grid">
        <section className="goal-panel">
          <div className="section-title">
            <h2>Your week, your pace</h2>
            <button
              className="link-button"
              disabled={!motivation}
              onClick={() => setEditing(true)}
            >
              Edit goal
            </button>
          </div>
          {motivation ? (
            <>
              <p className="goal-number">
                <strong>{motivation.weekly}</strong>
                <span> / {motivation.goal} sessions</span>
              </p>
              <progress
                className="meter"
                value={Math.min(motivation.weekly, motivation.goal)}
                max={motivation.goal}
                aria-label="Weekly practice goal"
              />
              <p className="muted">
                {motivation.weekly >= motivation.goal
                  ? "You’ve reached your goal. Everything extra is a bonus."
                  : "Every completed session counts, whatever your score."}
              </p>
              <small>Monday–Sunday · {motivation.timezone}</small>
              <div className="milestones" aria-label="Completion milestones">
                {[1, 5, 10].map((n) => (
                  <span
                    className={motivation.total >= n ? "earned" : ""}
                    key={n}
                  >
                    <Icon name="Progress" />
                    <strong>{n}</strong>
                    <small>
                      {n === 1 ? "First step" : `${n} sessions`}
                      {motivation.total >= n ? " · earned" : " · ahead"}
                    </small>
                  </span>
                ))}
              </div>
              <p className="meta">
                Milestones celebrate showing up, not exam readiness.
              </p>
            </>
          ) : error ? (
            <p role="alert">
              Your practice is safe. Goals could not load: {error}
            </p>
          ) : (
            <p role="status">Loading your weekly goal…</p>
          )}
        </section>
        <section className="feedback-inbox">
          <div className="section-title">
            <h2>A little feedback, a next step</h2>
            <button className="link-button" onClick={() => onPage("Progress")}>
              All progress
            </button>
          </div>
          {published.slice(0, 3).map((a: any) => (
            <button
              className="feedback-inbox-item"
              key={a.id}
              onClick={() => onAssessment(a.id)}
            >
              <span className="round-icon">
                <Icon name="Reviews" />
              </span>
              <span>
                <strong>Feedback ready</strong>
                <small>
                  {friendlyStatus(a.mode)} · {date(a.submitted_at)}
                </small>
              </span>
              <Icon name="Arrow" />
            </button>
          ))}
          {!published.length && (
            <Empty
              title="Your first insight is ahead"
              text="After a session, checked feedback will help you choose one thing to work on."
            />
          )}
          {pending.slice(0, 2).map((a: any) => (
            <p className="pending-note" key={a.id}>
              {learnerStatus(a.state)} · {date(a.submitted_at)}
            </p>
          ))}
        </section>
      </div>
      {editing && (
        <Dialog
          title="Set your weekly practice goal"
          onClose={() => setEditing(false)}
        >
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              setError("");
              try {
                setMotivation(
                  await api("family/motivation", {
                    familyId,
                    learnerId: learner,
                    goal,
                    timezone,
                  }),
                );
                setEditing(false);
              } catch (e: any) {
                setError(e.message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <p>
              Choose a pace that fits your week. You can change it any time.
            </p>
            <label className="field">
              Sessions per week
              <select
                value={goal}
                onChange={(e) => setGoal(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "session" : "sessions"}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Your time zone
              <input
                required
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                list="goal-timezones"
              />
              <datalist id="goal-timezones">
                {[
                  ...new Set([
                    "UTC",
                    "Europe/Amsterdam",
                    "Europe/London",
                    Intl.DateTimeFormat().resolvedOptions().timeZone,
                  ]),
                ].map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <Button disabled={saving}>
              {saving ? "Saving…" : "Save goal"}
            </Button>
          </form>
        </Dialog>
      )}
    </>
  );
}
