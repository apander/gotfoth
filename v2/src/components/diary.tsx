"use client";
import { useState } from "react";
import { api } from "./api";
import { useRead } from "./workspace-data";
import { ReadState, Pagination } from "./desktop-handoff";
import { Button, Dialog, PageHeading } from "./ui";
import { friendlyStatus } from "../lib/personas";
import type { Destination } from "../lib/experience";
type Run = (fn: () => Promise<void>) => void;
export const topicName = (s: string) =>
  s.replaceAll(".", " ").replaceAll("_", " ");
export function Diary({
  familyId,
  learnerId,
  courses,
  calendar,
  route,
  onRoute,
  onAttempt,
  run,
  busy,
  refresh,
  readOnly = false,
}: {
  familyId: string;
  learnerId: string;
  courses: any[];
  calendar: string;
  route: Destination;
  onRoute: (v: Destination) => void;
  onAttempt: (id: string) => void;
  run: Run;
  busy: boolean;
  refresh: () => Promise<void>;
  readOnly?: boolean;
}) {
  const [adding, setAdding] = useState(false),
    [moving, setMoving] = useState<any>(null),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const course = courses.find((c) => c.id === route.course) ?? courses[0];
  const stamp =
    route.date ||
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: course?.data.timezone ?? "UTC",
    }).format(new Date());
  const start = new Date(stamp + "T12:00:00Z"),
    view = route.view || "week";
  if (view === "week")
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const from = start.toISOString().slice(0, 10),
    end = new Date(start);
  end.setUTCDate(
    end.getUTCDate() + (view === "day" ? 0 : view === "week" ? 6 : 30),
  );
  const path = `family/diary?${new URLSearchParams({ family: familyId, learner: learnerId, from, to: end.toISOString().slice(0, 10), offset: route.offset ?? "0" })}`;
  const { data, error, refresh: reload } = useRead(path);
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: course?.data.timezone ?? "UTC",
  }).format(new Date());
  const weekStart = new Date(stamp + "T12:00:00Z");
  weekStart.setUTCDate(
    weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7),
  );
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
  const entries: {
    id: string;
    day: string;
    exam?: any;
    session?: any;
    sort: string;
  }[] = [
    ...(data?.exams ?? []).map((exam: any) => ({
      id: exam.id,
      day: exam.date,
      exam,
      sort: "",
    })),
    ...(data?.items ?? []).map((session: any) => ({
      id: session.id,
      day: new Intl.DateTimeFormat("sv-SE", {
        timeZone: session.data.timezone,
      }).format(new Date(session.data.start)),
      session,
      sort: session.data.start,
    })),
  ].sort((a, b) => a.day.localeCompare(b.day) || a.sort.localeCompare(b.sort));
  const displayDays =
    view === "day"
      ? [new Date(stamp + "T12:00:00Z")]
      : view === "week"
        ? weekDays
        : Array.from(new Set([stamp, ...entries.map((e) => e.day)]))
            .sort()
            .map((d) => new Date(d + "T12:00:00Z"));
  function shift(direction: number) {
    const d = new Date(stamp + "T12:00:00Z");
    d.setUTCDate(
      d.getUTCDate() +
        direction * (view === "day" ? 1 : view === "week" ? 7 : 31),
    );
    onRoute({ date: d.toISOString().slice(0, 10), offset: "0" });
  }
  async function update() {
    await reload();
    await refresh();
  }
  function openAdd() {
    const eligible = course?.data.taughtTopics.length
      ? course
      : courses.find((c) => c.data.taughtTopics.length);
    if (!eligible) return;
    if (eligible.id !== course?.id) onRoute({ course: eligible.id });
    setRequestId(crypto.randomUUID());
    setAdding(true);
  }
  return (
    <>
      <PageHeading label="STUDY & EXAMS" title="Your diary." />
      <section className="diary-calendar" aria-label="Study diary">
        <div className="diary-month">
          <div>
            <p className="eyebrow">YOUR DIARY</p>
            <h2>
              {start.toLocaleDateString("en-GB", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </h2>
          </div>
          <div className="row">
            <button
              className="button secondary"
              aria-label="Previous period"
              onClick={() => shift(-1)}
            >
              ‹
            </button>
            <button
              className="button secondary"
              onClick={() => onRoute({ date: today, offset: "0" })}
            >
              Today
            </button>
            <button
              className="button secondary"
              aria-label="Next period"
              onClick={() => shift(1)}
            >
              ›
            </button>
          </div>
        </div>
        <div
          className="diary-view-switch segmented"
          role="group"
          aria-label="Diary view"
        >
          {["day", "week", "agenda"].map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => onRoute({ view: v, offset: "0" })}
            >
              {v === "day" ? "Day" : v === "week" ? "Week" : "Agenda"}
            </button>
          ))}
        </div>
        <div className="diary-week-strip" aria-label="Choose a day">
          {weekDays.map((day) => {
            const key = day.toISOString().slice(0, 10);
            const count = entries.filter((e) => e.day === key).length;
            return (
              <button
                key={key}
                aria-pressed={key === stamp}
                aria-label={day.toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                })}
                onClick={() => {
                  onRoute({ date: key, offset: "0" });
                }}
              >
                <span>
                  {day.toLocaleDateString("en-GB", {
                    weekday: "short",
                    timeZone: "UTC",
                  })}
                </span>
                <strong>{day.getUTCDate()}</strong>
                <span
                  className="diary-day-dot"
                  data-filled={count > 0}
                  aria-label={`${count} entries`}
                />
              </button>
            );
          })}
        </div>
        <div className="diary-quick-actions">
          <span className="meta">{course?.data.timezone ?? "UTC"}</span>
          {!readOnly && (
            <Button
              disabled={
                busy || !courses.some((c) => c.data.taughtTopics.length)
              }
              onClick={openAdd}
            >
              + Add session
            </Button>
          )}
        </div>
      </section>
      {!data ? (
        <ReadState error={error} refresh={reload} />
      ) : (
        <>
          <div
            className="diary-pages"
            data-view={view}
            aria-label="Diary entries"
          >
            {displayDays.map((day) => {
              const key = day.toISOString().slice(0, 10),
                dayEntries = entries.filter((e) => e.day === key);
              return (
                <section
                  className={`diary-page ${key === today ? "is-today" : ""} ${key === stamp ? "is-selected" : ""}`}
                  id={`diary-${key}`}
                  key={key}
                >
                  <header className="diary-date-heading">
                    <strong>{day.getUTCDate()}</strong>
                    <div>
                      <h2>
                        {day.toLocaleDateString("en-GB", {
                          weekday: "long",
                          timeZone: "UTC",
                        })}
                      </h2>
                      <span>
                        {day.toLocaleDateString("en-GB", {
                          month: "long",
                          timeZone: "UTC",
                        })}
                        {key === today ? " · Today" : ""}
                      </span>
                    </div>
                  </header>
                  <div className="diary-day-entries">
                    {!dayEntries.length && (
                      <p className="diary-free-time">
                        Nothing planned · room to recharge
                      </p>
                    )}
                    {dayEntries.map((entry) => {
                      if (entry.exam) {
                        const exam = entry.exam;
                        return (
                          <article
                            className="diary-entry exam-entry"
                            key={entry.id}
                          >
                            <span className="diary-time">All day</span>
                            <div>
                              <span className="status-pill">
                                {exam.confirmed
                                  ? "Confirmed exam"
                                  : "Date to confirm"}
                              </span>
                              <h3 className="capitalize">
                                {exam.subject} · {exam.unit}
                              </h3>
                              <p className="meta">
                                Date only · {exam.timezone}
                              </p>
                            </div>
                          </article>
                        );
                      }
                      const s = entry.session;
                      return (
                        <article
                          className="diary-entry study-entry"
                          key={entry.id}
                        >
                          <span className="diary-time">
                            {new Date(s.data.start).toLocaleTimeString(
                              "en-GB",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: s.data.timezone,
                              },
                            )}
                          </span>
                          <div>
                            <p className="eyebrow">
                              {friendlyStatus(s.state)} · {s.data.minutes} min
                            </p>
                            <h3>{s.data.title}</h3>
                            <p className="meta">{s.data.purpose}</p>
                            {!readOnly && (
                              <div className="row">
                                {s.state === "proposed" ? (
                                  <Button
                                    disabled={busy}
                                    onClick={() =>
                                      run(async () => {
                                        await api("family/plan/action", {
                                          familyId,
                                          id: s.id,
                                          action: "approve",
                                        });
                                        await update();
                                      })
                                    }
                                  >
                                    Approve session
                                  </Button>
                                ) : s.state === "approved" ? (
                                  <Button
                                    variant="secondary"
                                    onClick={() => onAttempt(s.data.attemptId)}
                                  >
                                    Open planned practice
                                  </Button>
                                ) : null}
                                {s.state !== "completed" && (
                                  <>
                                    <button
                                      className="link-button"
                                      disabled={busy}
                                      onClick={() => setMoving(s)}
                                    >
                                      Move
                                    </button>
                                    <button
                                      className="link-button"
                                      disabled={busy}
                                      onClick={() =>
                                        run(async () => {
                                          await api("family/plan/action", {
                                            familyId,
                                            id: s.id,
                                            action: "cancel",
                                          });
                                          await update();
                                        })
                                      }
                                    >
                                      Cancel session
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          <Pagination
            {...data}
            onChange={(offset) => onRoute({ offset: String(offset) })}
          />
        </>
      )}
      <details className="diary-toolbar card stack">
        <summary>Planning & calendar settings</summary>
        <label className="field">
          Jump to date
          <input
            type="date"
            value={stamp}
            onChange={(e) => {
              if (e.target.value)
                onRoute({ date: e.target.value, offset: "0" });
            }}
          />
        </label>
        <div className="form-grid">
          {!readOnly && (
            <label className="field">
              Subject
              <select
                value={course?.id ?? ""}
                onChange={(e) => onRoute({ course: e.target.value })}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.data.subject}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {!readOnly && (
          <>
            <p className="meta">
              Diary timezone:{" "}
              {course?.data.timezone ?? "Set up your course on a computer"}.
              Approving a session prepares it; the test starts on your computer.
            </p>
            <div className="row">
              <Button
                disabled={busy || !course?.data.taughtTopics.length}
                onClick={() => {
                  setRequestId(crypto.randomUUID());
                  setAdding(true);
                }}
              >
                Add study session
              </Button>
              <Button
                variant="secondary"
                disabled={busy || !course}
                onClick={() =>
                  run(async () => {
                    await api("family/plan/propose", {
                      familyId,
                      learnerId,
                      enrolmentId: course.id,
                      week: from,
                    });
                    await update();
                  })
                }
              >
                Suggest my week
              </Button>
            </div>
            <button
              className="link-button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (calendar === "connected") {
                    await api("calendar/disconnect", {});
                    await update();
                  } else {
                    const value = await api("calendar/connect", { familyId });
                    location.assign(value.url);
                  }
                })
              }
            >
              {calendar === "connected"
                ? "Disconnect Google Calendar"
                : calendar === "reconnect"
                  ? "Reconnect Google Calendar"
                  : "Connect Google Calendar"}
            </button>
            <p className="meta">
              Calendar: {calendar}. One-way publishing of approved study and
              confirmed exam dates. Reminder timing is in Reminders.
            </p>
          </>
        )}
      </details>
      {adding && course && (
        <Dialog title="Plan a study session" onClose={() => setAdding(false)}>
          <form
            key={course.id}
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              run(async () => {
                await api("family/plan/create", {
                  familyId,
                  id: requestId,
                  learnerId,
                  enrolmentId: course.id,
                  topic: fields.get("topic"),
                  date: fields.get("date"),
                  time: fields.get("time"),
                  minutes: Number(fields.get("minutes")),
                });
                setAdding(false);
                onRoute({ date: String(fields.get("date")), offset: "0" });
                await update();
              });
            }}
          >
            <label className="field">
              Subject
              <select
                value={course.id}
                onChange={(e) => onRoute({ course: e.target.value })}
              >
                {courses
                  .filter((c) => c.data.taughtTopics.length)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.data.subject}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Topic
              <select name="topic" required>
                {course.data.taughtTopics.map((t: string) => (
                  <option key={t} value={t}>
                    {topicName(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Date
              <input name="date" type="date" defaultValue={stamp} required />
            </label>
            <label className="field">
              Time in {course.data.timezone}
              <input name="time" type="time" defaultValue="17:00" required />
            </label>
            <label className="field">
              Minutes
              <input
                name="minutes"
                type="number"
                min="5"
                max="180"
                defaultValue={course.data.sessionMinutes ?? 20}
                required
              />
            </label>
            <p className="meta">
              Independent practice. Review and approve the session after adding
              it.
            </p>
            <Button disabled={busy}>Add to diary</Button>
          </form>
        </Dialog>
      )}
      {moving && (
        <Dialog title="Move study session" onClose={() => setMoving(null)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(async () => {
                const { zonedInstant } = await import("../lib/time");
                const value = zonedInstant(
                  String(f.get("date")),
                  String(f.get("time")),
                  moving.data.timezone,
                );
                if (!value)
                  throw new Error(
                    "This time does not exist in the diary timezone. Choose another time.",
                  );
                await api("family/plan/action", {
                  familyId,
                  id: moving.id,
                  action: "reschedule",
                  start: value,
                });
                setMoving(null);
                onRoute({ date: String(f.get("date")), offset: "0" });
                await update();
              });
            }}
          >
            <label className="field">
              New date
              <input
                name="date"
                type="date"
                required
                defaultValue={moving.data.start.slice(0, 10)}
              />
            </label>
            <label className="field">
              Time in {moving.data.timezone}
              <input name="time" type="time" defaultValue="17:00" required />
            </label>
            <p>
              A moved session returns to Suggested and needs approval again. An
              active test cannot be moved.
            </p>
            <Button disabled={busy}>Save new time</Button>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function CoursePlanning({
  course,
  familyId,
  learnerId,
  topics,
  run,
  busy,
  refresh,
}: {
  course: any;
  familyId: string;
  learnerId: string;
  topics: string[];
  run: Run;
  busy: boolean;
  refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<"topics" | "routine" | "exams" | null>(
      null,
    ),
    [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<any>(null);
  function open(kind: typeof editing) {
    setDraft(structuredClone(course.data));
    setEditing(kind);
    setNotice("");
  }
  function save(patch: any) {
    run(async () => {
      await api("family/planning", {
        familyId,
        learnerId,
        id: course.id,
        patch,
      });
      await refresh();
      setEditing(null);
      setNotice("Changes saved.");
    });
  }
  return (
    <section className="card course-companion">
      <h2 className="capitalize">{course.data.subject}</h2>
      <p>
        {course.data.targetSession} · Specification {course.data.specification}
      </p>
      <p className="meta">
        {course.data.option ? `${course.data.option} · ` : ""}Extra time:{" "}
        {course.data.extraTimePercent}% · Diary timezone: {course.data.timezone}
      </p>
      <div className="stack">
        <button className="setting-row" onClick={() => open("topics")}>
          Topics taught{" "}
          <span>{course.data.taughtTopics.length} selected →</span>
        </button>
        <button className="setting-row" onClick={() => open("routine")}>
          Study routine{" "}
          <span>{course.data.availability.length} time slots →</span>
        </button>
        <button className="setting-row" onClick={() => open("exams")}>
          Exam dates <span>{course.data.examDates.length} recorded →</span>
        </button>
      </div>
      <p role="status">{notice}</p>
      {editing && draft && (
        <Dialog
          title={
            editing === "topics"
              ? "Topics you have covered"
              : editing === "routine"
                ? "Your study routine"
                : "Your exam dates"
          }
          onClose={() => setEditing(null)}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              save(
                editing === "topics"
                  ? { taughtTopics: draft.taughtTopics }
                  : editing === "routine"
                    ? {
                        availability: draft.availability,
                        blockedDates: draft.blockedDates,
                        sessionMinutes: draft.sessionMinutes,
                        timezone: draft.timezone,
                      }
                    : { examDates: draft.examDates },
              );
            }}
          >
            {editing === "topics" &&
              [...new Set([...topics, ...draft.taughtTopics])].map((t) => (
                <label className="choice-row" key={t}>
                  <input
                    type="checkbox"
                    checked={draft.taughtTopics.includes(t)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        taughtTopics: e.target.checked
                          ? [...draft.taughtTopics, t]
                          : draft.taughtTopics.filter((v: string) => v !== t),
                      })
                    }
                  />
                  {topicName(t)}
                </label>
              ))}
            {editing === "routine" && (
              <>
                <label className="field">
                  Diary timezone
                  <input
                    required
                    value={draft.timezone}
                    onChange={(e) =>
                      setDraft({ ...draft, timezone: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Preferred session length (minutes)
                  <input
                    type="number"
                    min="5"
                    max="180"
                    required
                    value={draft.sessionMinutes}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        sessionMinutes: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <h3>Weekly availability</h3>
                {draft.availability.map((slot: any, i: number) => (
                  <div className="routine-slot" key={i}>
                    <label className="field">
                      Day
                      <select
                        value={slot.day}
                        onChange={(e) => {
                          const a = [...draft.availability];
                          a[i] = { ...slot, day: Number(e.target.value) };
                          setDraft({ ...draft, availability: a });
                        }}
                      >
                        {[
                          "Sunday",
                          "Monday",
                          "Tuesday",
                          "Wednesday",
                          "Thursday",
                          "Friday",
                          "Saturday",
                        ].map((d, index) => (
                          <option key={d} value={index}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Start
                      <input
                        type="time"
                        required
                        value={slot.start}
                        onChange={(e) => {
                          const a = [...draft.availability];
                          a[i] = { ...slot, start: e.target.value };
                          setDraft({ ...draft, availability: a });
                        }}
                      />
                    </label>
                    <label className="field">
                      Minutes
                      <input
                        type="number"
                        required
                        min="5"
                        max="180"
                        value={slot.minutes}
                        onChange={(e) => {
                          const a = [...draft.availability];
                          a[i] = { ...slot, minutes: Number(e.target.value) };
                          setDraft({ ...draft, availability: a });
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          availability: draft.availability.filter(
                            (_: any, index: number) => index !== i,
                          ),
                        })
                      }
                    >
                      Remove time
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      availability: [
                        ...draft.availability,
                        { day: 1, start: "17:00", minutes: 30 },
                      ],
                    })
                  }
                >
                  Add time
                </button>
                <h3>Dates to keep free</h3>
                {draft.blockedDates.map((d: string, i: number) => (
                  <div className="row" key={i}>
                    <label className="field">
                      Blocked date
                      <input
                        type="date"
                        required
                        value={d}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            blockedDates: draft.blockedDates.map(
                              (v: string, index: number) =>
                                index === i ? e.target.value : v,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          blockedDates: draft.blockedDates.filter(
                            (_: any, index: number) => index !== i,
                          ),
                        })
                      }
                    >
                      Remove date
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      blockedDates: [...draft.blockedDates, ""],
                    })
                  }
                >
                  Add blocked date
                </button>
              </>
            )}
            {editing === "exams" && (
              <>
                <p>
                  Enter the date confirmed by your school. A sitting time is not
                  assumed.
                </p>
                {draft.examDates.map((exam: any, i: number) => (
                  <fieldset className="stack" key={i}>
                    <legend>Exam {i + 1}</legend>
                    <label className="field">
                      Unit
                      <input
                        required
                        value={exam.unit}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            examDates: draft.examDates.map(
                              (v: any, index: number) =>
                                index === i
                                  ? { ...v, unit: e.target.value }
                                  : v,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      Date
                      <input
                        type="date"
                        required
                        value={exam.date}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            examDates: draft.examDates.map(
                              (v: any, index: number) =>
                                index === i
                                  ? { ...v, date: e.target.value }
                                  : v,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="choice-row">
                      <input
                        type="checkbox"
                        checked={exam.confirmed}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            examDates: draft.examDates.map(
                              (v: any, index: number) =>
                                index === i
                                  ? { ...v, confirmed: e.target.checked }
                                  : v,
                            ),
                          })
                        }
                      />
                      Confirmed by my school
                    </label>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          examDates: draft.examDates.filter(
                            (_: any, index: number) => index !== i,
                          ),
                        })
                      }
                    >
                      Remove exam
                    </button>
                  </fieldset>
                ))}
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      examDates: [
                        ...draft.examDates,
                        { unit: "", date: "", confirmed: false },
                      ],
                    })
                  }
                >
                  Add exam date
                </button>
              </>
            )}
            <Button disabled={busy}>Save changes</Button>
          </form>
        </Dialog>
      )}
    </section>
  );
}
