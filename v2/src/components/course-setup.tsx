"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Dialog, Icon } from "./ui";
import { ScheduleFields } from "./schedule-fields";
import { examSessionChoices } from "../lib/sessions";
import { Enrolment } from "../lib/contracts";

const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const stages = ["Your course", "Your starting point", "Your study rhythm"];
type Slot = { day: number; start: string; minutes: number };
type Subject = { id: "psychology" | "business"; label: string; code: string };
const label = (value: string) => {
  const words = value.replaceAll(".", " ").replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// Mount a fresh draft on opening; hidden subjects never retain a stale form.
export function CourseSetup(props: {
  subject: Subject;
  enrolment: any;
  papers: any[];
  familyId: string;
  learnerId: string;
  open: boolean;
  onClose: () => void;
  run: (fn: () => Promise<void>) => void;
  refresh: () => Promise<void>;
}) {
  return props.open ? <CourseDraft {...props} /> : null;
}
function CourseDraft({
  subject,
  enrolment,
  papers,
  familyId,
  learnerId,
  onClose,
  run,
  refresh,
}: Parameters<typeof CourseSetup>[0]) {
  const saved = enrolment?.data;
  const specs: string[] = [
    ...new Set<string>(
      papers
        .filter((p) => p.subject === subject.id)
        .flatMap((p) => p.compatibleSpecifications ?? [])
        .filter(Boolean),
    ),
  ];
  if (saved?.specification && !specs.includes(saved.specification))
    specs.unshift(saved.specification);
  const [session, setSession] = useState(saved?.targetSession ?? "");
  const [spec, setSpec] = useState(
    saved?.specification ?? (specs.length === 1 ? specs[0] : ""),
  );
  const [topics, setTopics] = useState<string[]>(saved?.taughtTopics ?? []);
  const [option, setOption] = useState(saved?.option ?? "");
  const [extra, setExtra] = useState(saved?.extraTimePercent ?? 0);
  const [timezone, setTimezone] = useState(
    saved?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [availability, setAvailability] = useState<Slot[]>(
    saved?.availability ?? [],
  );
  const [examDates, setExamDates] = useState(
    JSON.stringify(saved?.examDates ?? []),
  );
  const [step, setStep] = useState(0),
    [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false),
    [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const busy = useRef(false);
  const sessions = examSessionChoices();
  if (session && !sessions.includes(session)) sessions.unshift(session);
  const topicChoices = [
    ...new Set<string>([
      ...papers
        .filter((p) => p.subject === subject.id)
        .flatMap((p) => p.topics ?? []),
      ...topics,
    ]),
  ];
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  function close() {
    if (busy.current) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  function updateSlot(index: number, patch: Partial<Slot>) {
    setAvailability((current) =>
      current.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    );
  }
  function save() {
    if (busy.current) return;
    const course = {
      subject: subject.id,
      specification: spec || subject.code,
      targetSession: session,
      taughtTopics: topics,
      option: subject.id === "psychology" && option ? option : undefined,
      timezone,
      extraTimePercent: extra,
      sessionMinutes: saved?.sessionMinutes ?? 20,
      availability,
      examDates: JSON.parse(examDates),
      blockedDates: saved?.blockedDates ?? [],
    };
    const checked = Enrolment.safeParse(course);
    if (!checked.success) {
      setError("Check your course details and study settings before saving.");
      return;
    }
    if (
      availability.some((slot) => {
        const [h, m] = slot.start.split(":").map(Number);
        return h > 23 || m > 59 || h * 60 + m + slot.minutes > 1440;
      })
    ) {
      setError("Choose study times that finish before midnight.");
      return;
    }
    busy.current = true;
    setSaving(true);
    setError("");
    run(async () => {
      try {
        await api("family/enrolment", {
          familyId,
          learnerId,
          course: checked.data,
        });
        await refresh();
        onClose();
      } catch {
        setError(
          "We couldn’t save your subject. Your choices are still here. Please try again.",
        );
      } finally {
        busy.current = false;
        setSaving(false);
      }
    });
  }
  return (
    <Dialog
      title={`${saved ? "Edit" : "Add"} ${subject.label}`}
      onClose={close}
      className="course-setup-dialog"
    >
      <form
        className="course-setup"
        onChange={() => setDirty(true)}
        onSubmit={(event) => {
          event.preventDefault();
          if (step < 2) {
            setError("");
            setStep(step + 1);
          } else save();
        }}
      >
        <ol className="setup-steps" aria-label="Subject setup progress">
          {stages.map((name, i) => (
            <li
              key={name}
              aria-current={i === step ? "step" : undefined}
              className={i <= step ? "reached" : ""}
            >
              <span aria-hidden="true">
                {i < step ? <Icon name="Check" /> : i + 1}
              </span>
              <span>{name}</span>
            </li>
          ))}
        </ol>
        <div className="setup-body">
          <p className="eyebrow">
            STEP {step + 1} OF 3 · {subject.label}
          </p>
          <h3 ref={heading} tabIndex={-1}>
            {
              [
                "Let’s make this course yours.",
                "Start with what you know.",
                "Make a little room for learning.",
              ][step]
            }
          </h3>
          <p className="muted">
            {
              [
                "A couple of details help us find the right questions. You can change these later.",
                "Choose topics you’ve covered in lessons. You don’t need to feel confident in them yet.",
                "Short sessions are a good start. Add times that usually work, or leave planning for later.",
              ][step]
            }
          </p>
          {step === 0 && (
            <div className="stack setup-fields">
              <label className="field">
                When are your exams?
                <select
                  required
                  aria-label="When are your exams?"
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
                >
                  <option value="">Choose your exam session</option>
                  {sessions.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <span className="muted field-help">
                  Not sure? Check with your teacher before choosing. You can
                  update this later.
                </span>
              </label>
              <label className="field">
                Course specification
                <select
                  required
                  aria-label="Course specification"
                  value={spec || (specs.length ? "" : subject.code)}
                  onChange={(e) => setSpec(e.target.value)}
                >
                  <option value="">Choose your course version</option>
                  {(specs.length ? specs : [subject.code]).map((value) => (
                    <option key={value} value={value}>
                      {subject.label} · {value}
                    </option>
                  ))}
                </select>
                <span className="muted field-help">
                  {specs.length === 1
                    ? "We’ve selected the available version. Check it matches your course."
                    : "Find this on your course materials, or ask your teacher."}
                </span>
              </label>
              {subject.id === "psychology" && (
                <details className="setup-details">
                  <summary>Studying a Unit 3 option?</summary>
                  <label className="field">
                    Unit 3 option
                    <select
                      value={option}
                      onChange={(e) => setOption(e.target.value)}
                    >
                      <option value="">I’ll add this later</option>
                      <option value="health">Health psychology</option>
                      <option value="criminological">
                        Criminological psychology
                      </option>
                    </select>
                  </label>
                </details>
              )}
            </div>
          )}
          {step === 1 && (
            <div className="stack setup-fields">
              <fieldset className="setup-topics">
                <legend className="sr-only">Topics you’ve covered</legend>
                {topicChoices.map((topic) => (
                  <label
                    key={topic}
                    className={`setup-topic${topics.includes(topic) ? " selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={topics.includes(topic)}
                      onChange={() =>
                        setTopics((current) =>
                          current.includes(topic)
                            ? current.filter((t) => t !== topic)
                            : [...current, topic],
                        )
                      }
                    />
                    <span>{label(topic)}</span>
                  </label>
                ))}
              </fieldset>
              {!topicChoices.length && (
                <p className="setup-note">
                  There aren’t any topics available for this subject yet. You
                  can save your course and add topics when they’re available.
                </p>
              )}
              <p className="setup-note" role="status">
                {topics.length
                  ? `${topics.length} ${topics.length === 1 ? "topic" : "topics"} chosen. We’ll use these to find a starting point for practice.`
                  : "Just getting started? You can add topics later. Practice questions become available once you choose a topic."}
              </p>
            </div>
          )}
          {step === 2 && (
            <div className="stack setup-fields">
              <div className="setup-recap">
                <Icon name="Subjects" />
                <span>
                  <strong>{subject.label}</strong> · {session}
                  <br />
                  <span className="muted">
                    {topics.length} {topics.length === 1 ? "topic" : "topics"}{" "}
                    chosen · {saved?.sessionMinutes ?? 20}-minute practice
                    sessions
                  </span>
                </span>
              </div>
              <fieldset className="setup-times">
                <legend>
                  When might you study? <span className="muted">Optional</span>
                </legend>
                {availability.map((slot, index) => (
                  <div className="setup-time" key={index}>
                    <label className="field">
                      Day{" "}
                      <select
                        aria-label={`Study day ${index + 1}`}
                        value={slot.day}
                        onChange={(e) =>
                          updateSlot(index, { day: Number(e.target.value) })
                        }
                      >
                        {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                          <option key={day} value={day}>
                            {days[day]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Start{" "}
                      <input
                        aria-label={`Start time ${index + 1}`}
                        required
                        type="time"
                        value={slot.start}
                        onChange={(e) =>
                          updateSlot(index, { start: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      Minutes{" "}
                      <input
                        aria-label={`Study minutes ${index + 1}`}
                        required
                        type="number"
                        min="5"
                        max="900"
                        value={slot.minutes}
                        onChange={(e) =>
                          updateSlot(index, { minutes: Number(e.target.value) })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="link-button"
                      aria-label={`Remove study time ${index + 1}`}
                      onClick={() => {
                        setDirty(true);
                        setAvailability((current) =>
                          current.filter((_, i) => i !== index),
                        );
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setDirty(true);
                    setAvailability((current) => [
                      ...current,
                      {
                        day: [1, 4, 2, 5, 3, 6, 0][current.length % 7],
                        start: "17:00",
                        minutes: saved?.sessionMinutes ?? 20,
                      },
                    ]);
                  }}
                >
                  <Icon name="Plus" /> Add a study time
                </button>
                {!availability.length && (
                  <p className="muted field-help">
                    No times added. You can still practise whenever you’re
                    ready.
                  </p>
                )}
              </fieldset>
              <details className="setup-details">
                <summary>Extra time &amp; time zone</summary>
                <p className="muted field-help">
                  If your school has agreed extra time, add the percentage here
                  for timed practice.
                </p>
                <div className="form-grid">
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
                      required
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                    />
                  </label>
                </div>
              </details>
              <details className="setup-details">
                <summary>
                  Confirmed exam dates <span className="muted">Optional</span>
                </summary>
                <p className="muted field-help">
                  Add exact dates when your school confirms them.
                </p>
                <ScheduleFields
                  kind="exams"
                  value={examDates}
                  onChange={(value) => {
                    setDirty(true);
                    setExamDates(value);
                  }}
                />
              </details>
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {discard && (
            <div className="setup-discard" role="alert">
              <p>Leave without saving your choices?</p>
              <div className="table-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setDiscard(false)}
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  className="button danger"
                  onClick={onClose}
                >
                  Discard changes
                </button>
              </div>
            </div>
          )}
        </div>
        <footer className="setup-footer">
          {step > 0 ? (
            <button
              type="button"
              className="button secondary"
              disabled={saving}
              onClick={() => {
                setError("");
                setStep(step - 1);
              }}
            >
              Back
            </button>
          ) : (
            <span className="muted field-help">
              You can update this anytime.
            </span>
          )}
          <button key={step} type="submit" className="button" disabled={saving}>
            {saving
              ? "Saving your subject…"
              : step < 2
                ? "Continue"
                : saved
                  ? `Save ${subject.label}`
                  : `Add ${subject.label}`}
            <Icon name={step < 2 ? "Arrow" : "Check"} />
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
