"use client";
import { useEffect, useRef, useState } from "react";

const SLOT_MINUTES = 30;
const DAY_START = 7 * 60;
const DAY_END = 22 * 60;
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const SHOWN_DAYS = [1, 2, 3, 4, 5, 6, 0];
const SLOT_COUNT = (DAY_END - DAY_START) / SLOT_MINUTES;

type Slot = { day: number; start: string; minutes: number };
type Cell = { day: number; index: number };

function minutesOf(start: string) {
  const [hour, minute] = start.split(":").map(Number);
  return hour * 60 + minute;
}
function clock(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function keyOf(day: number, index: number) {
  return `${day}-${index}`;
}
export function cellsFromAvailability(rows: Slot[]) {
  const keys = new Set<string>();
  for (const row of rows) {
    const begin = minutesOf(row.start);
    const end = begin + row.minutes;
    for (let time = DAY_START; time < DAY_END; time += SLOT_MINUTES) {
      if (time < end && time + SLOT_MINUTES > begin)
        keys.add(keyOf(row.day, (time - DAY_START) / SLOT_MINUTES));
    }
  }
  return keys;
}
export function availabilityFromCells(keys: Iterable<string>) {
  const byDay = new Map<number, number[]>();
  for (const key of keys) {
    const [day, index] = key.split("-").map(Number);
    byDay.set(day, [...(byDay.get(day) ?? []), index]);
  }
  const slots: Slot[] = [];
  for (const day of SHOWN_DAYS) {
    const indices = [...(byDay.get(day) ?? [])].sort((a, b) => a - b);
    let run: number[] = [];
    const flush = () => {
      if (!run.length) return;
      slots.push({
        day,
        start: clock(DAY_START + run[0] * SLOT_MINUTES),
        minutes: run.length * SLOT_MINUTES,
      });
      run = [];
    };
    for (const index of indices) {
      if (run.length && index !== run[run.length - 1] + 1) flush();
      run.push(index);
    }
    flush();
  }
  return slots;
}
export function clearBlock(keys: Set<string>, day: number, index: number) {
  const next = new Set(keys);
  let lower = index;
  let upper = index;
  while (next.has(keyOf(day, lower - 1))) lower -= 1;
  while (next.has(keyOf(day, upper + 1))) upper += 1;
  for (let time = lower; time <= upper; time += 1) next.delete(keyOf(day, time));
  return next;
}
function rectangle(start: Cell, end: Cell) {
  const columns = SHOWN_DAYS;
  const from = Math.min(columns.indexOf(start.day), columns.indexOf(end.day));
  const to = Math.max(columns.indexOf(start.day), columns.indexOf(end.day));
  const first = Math.min(start.index, end.index);
  const last = Math.max(start.index, end.index);
  const keys: string[] = [];
  for (let column = from; column <= to; column += 1)
    for (let index = first; index <= last; index += 1)
      keys.push(keyOf(columns[column], index));
  return keys;
}
function cellAt(target: EventTarget | null) {
  const element = target instanceof Element ? target.closest("[data-slot]") : null;
  if (!element) return null;
  return {
    day: Number(element.getAttribute("data-day")),
    index: Number(element.getAttribute("data-slot")),
  };
}
function describe(slot: Slot) {
  const end = clock(minutesOf(slot.start) + slot.minutes);
  return `${DAY_NAMES[slot.day]} ${slot.start}–${end}`;
}

function WeekPlanner({
  rows,
  onChange,
}: {
  rows: Slot[];
  onChange: (value: string) => void;
}) {
  const selected = cellsFromAvailability(rows);
  const [drag, setDrag] = useState<null | { start: Cell; end: Cell }>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      const evening = node.querySelector('[data-slot="18"]');
      if (evening instanceof HTMLElement)
        node.scrollTop = Math.max(0, evening.offsetTop - 36);
      observer.disconnect();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const removing =
    drag !== null &&
    drag.start.day === drag.end.day &&
    drag.start.index === drag.end.index &&
    selected.has(keyOf(drag.start.day, drag.start.index));
  const preview = new Set(drag && !removing ? rectangle(drag.start, drag.end) : []);
  function commit(start: Cell, end: Cell) {
    const same = start.day === end.day && start.index === end.index;
    const next =
      same && selected.has(keyOf(start.day, start.index))
        ? clearBlock(selected, start.day, start.index)
        : new Set([...selected, ...rectangle(start, end)]);
    setDrag(null);
    onChange(JSON.stringify(availabilityFromCells(next)));
  }
  return (
    <div className="stack">
      <h3>Weekly availability</h3>
      <p className="muted">
        Drag across a day and time to mark when study can happen. Click a block
        to clear it.
      </p>
      <div
        className="week-planner"
        role="group"
        aria-label="Weekly availability"
        ref={scroller}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const cell = cellAt(event.target);
          if (!cell) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag({ start: cell, end: cell });
        }}
        onPointerMove={(event) => {
          if (!drag) return;
          const cell = cellAt(document.elementFromPoint(event.clientX, event.clientY));
          if (!cell || (cell.day === drag.end.day && cell.index === drag.end.index)) return;
          setDrag({ ...drag, end: cell });
        }}
        onPointerUp={(event) => {
          if (!drag) return;
          const cell =
            cellAt(document.elementFromPoint(event.clientX, event.clientY)) ?? drag.end;
          commit(drag.start, cell);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="week-head-row">
          <div className="week-corner" />
          {SHOWN_DAYS.map((day) => (
            <div className="week-head" key={day}>
              {DAY_NAMES[day].slice(0, 3)}
            </div>
          ))}
        </div>
        {Array.from({ length: SLOT_COUNT }, (_, index) => {
          const start = DAY_START + index * SLOT_MINUTES;
          return (
            <div className="week-row" key={start}>
              <div className="week-time">{index % 2 === 0 ? clock(start) : ""}</div>
              {SHOWN_DAYS.map((day) => {
                const on = selected.has(keyOf(day, index));
                return (
                  <button
                    type="button"
                    className={`week-cell${on ? " on" : ""}${preview.has(keyOf(day, index)) ? " preview" : ""}`}
                    key={day}
                    data-day={day}
                    data-slot={index}
                    aria-pressed={on}
                    aria-label={`${DAY_NAMES[day]} ${clock(start)} to ${clock(start + SLOT_MINUTES)}${on ? ", available" : ""}`}
                    onClick={(event) => {
                      if (event.detail !== 0) return;
                      const cell = cellAt(event.currentTarget);
                      if (cell) commit(cell, cell);
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="muted">{rows.length ? rows.map(describe).join(" · ") : "No study times yet."}</p>
    </div>
  );
}

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
  if (kind === "availability")
    return <WeekPlanner rows={rows} onChange={onChange} />;
  const update = (i: number, patch: object) =>
    onChange(
      JSON.stringify(rows.map((r, n) => (n === i ? { ...r, ...patch } : r))),
    );
  return (
    <div className="stack">
      <h3>Confirmed exam dates</h3>
      {rows.map((row, i) => (
        <div className="schedule-row" key={i}>
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
          <button
            type="button"
            className="link-button"
            aria-label={`Remove exam row ${i + 1}`}
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
            JSON.stringify([...rows, { unit: "", date: "", confirmed: false }]),
          )
        }
      >
        Add exam date
      </button>
    </div>
  );
}
