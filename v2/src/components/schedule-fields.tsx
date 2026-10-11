"use client";
// Form rows serialize to the existing enrolment contract; no API/schema change.
export function ScheduleFields({
  value,
  onChange,
  kind,
}: {
  value: string;
  onChange: (v: string) => void;
  kind: "availability" | "exams";
}) {
  let rows: any[] = [];
  try {
    rows = JSON.parse(value);
  } catch {
    return (
      <p className="error">
        Saved schedule could not be read. Reload before editing.
      </p>
    );
  }
  const update = (i: number, patch: object) =>
    onChange(
      JSON.stringify(rows.map((r, n) => (n === i ? { ...r, ...patch } : r))),
    );
  return (
    <div className="stack">
      <h3>
        {kind === "availability"
          ? "Weekly availability"
          : "Confirmed exam dates"}
      </h3>
      {rows.map((row, i) => (
        <div className="schedule-row" key={i}>
          {kind === "availability" ? (
            <>
              <label className="field">
                Day
                <select
                  value={row.day}
                  onChange={(e) => update(i, { day: Number(e.target.value) })}
                >
                  {[
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ].map((day, index) => (
                    <option value={index} key={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Start time
                <input
                  type="time"
                  required
                  value={row.start}
                  onChange={(e) => update(i, { start: e.target.value })}
                />
              </label>
              <label className="field">
                Minutes
                <input
                  type="number"
                  min={1}
                  max={240}
                  required
                  value={row.minutes}
                  onChange={(e) =>
                    update(i, { minutes: Number(e.target.value) })
                  }
                />
              </label>
            </>
          ) : (
            <>
              <label className="field">
                Unit
                <input
                  required
                  placeholder="WPS03/01"
                  value={row.unit}
                  onChange={(e) => update(i, { unit: e.target.value })}
                />
              </label>
              <label className="field">
                Exam date
                <input
                  required
                  type="date"
                  value={row.date}
                  onChange={(e) => update(i, { date: e.target.value })}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={row.confirmed === true}
                  onChange={(e) => update(i, { confirmed: e.target.checked })}
                />
                Date confirmed
              </label>
            </>
          )}
          <button
            type="button"
            className="link-button"
            aria-label={`Remove ${kind === "availability" ? "availability" : "exam"} row ${i + 1}`}
            onClick={() =>
              onChange(JSON.stringify(rows.filter((_, n) => n !== i)))
            }
          >
            Remove
          </button>
        </div>
      ))}
      <button
        className="button secondary small"
        type="button"
        onClick={() =>
          onChange(
            JSON.stringify([
              ...rows,
              kind === "availability"
                ? { day: 1, start: "17:00", minutes: 20 }
                : { unit: "", date: "", confirmed: false },
            ]),
          )
        }
      >
        Add {kind === "availability" ? "study time" : "exam date"}
      </button>
    </div>
  );
}
