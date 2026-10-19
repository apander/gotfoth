import type { SourceDeskState } from "./exam-sources";

export type AnswerPosition = {
  field?: string;
  top: number;
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
};
export type ExamWorkspaceState = {
  version: 1;
  question?: string;
  width: number;
  view: "source" | "answer";
  sources: SourceDeskState;
  answers: Record<string, AnswerPosition>;
};
export function newExamWorkspace(): ExamWorkspaceState {
  return {
    version: 1,
    width: 50,
    view: "source",
    sources: { readers: {} },
    answers: {},
  };
}
function object(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function bounded(
  value: unknown,
  fallback: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}
// Workspace preferences are optional. A damaged or unavailable local store must
// never prevent opening an attempt or recovering the authoritative answer.
export function readExamWorkspace(raw: string | null): ExamWorkspaceState {
  const result = newExamWorkspace();
  try {
    const parsed = JSON.parse(raw ?? "null");
    if (!object(parsed) || parsed.version !== 1) return result;
    result.width = bounded(parsed.width, 50, 35, 65);
    result.view = parsed.view === "answer" ? "answer" : "source";
    if (typeof parsed.question === "string") result.question = parsed.question;
    if (object(parsed.answers))
      for (const [key, value] of Object.entries(parsed.answers)) {
        if (!object(value)) continue;
        result.answers[key] = {
          ...(typeof value.field === "string" ? { field: value.field } : {}),
          top: bounded(value.top, 0),
          start: bounded(value.start, 0),
          end: bounded(value.end, 0),
          direction:
            value.direction === "forward" || value.direction === "backward"
              ? value.direction
              : "none",
        };
      }
    if (object(parsed.sources)) {
      if (object(parsed.sources.selections))
        result.sources.selections = Object.fromEntries(
          Object.entries(parsed.sources.selections).filter(
            (entry) => typeof entry[1] === "string",
          ),
        );
      if (typeof parsed.sources.selected === "string")
        result.sources.selected = parsed.sources.selected;
      const pin = parsed.sources.pin;
      if (
        object(pin) &&
        typeof pin.source === "string" &&
        typeof pin.block === "string"
      )
        result.sources.pin = {
          source: pin.source,
          block: pin.block,
          start: bounded(pin.start, 0),
          ...(typeof pin.end === "number" ? { end: bounded(pin.end, 0) } : {}),
          ...(Array.isArray(pin.parts)
            ? {
                parts: pin.parts
                  .filter(
                    (p: any) =>
                      object(p) &&
                      typeof p.block === "string" &&
                      Number.isInteger(p.start) &&
                      Number.isInteger(p.end) &&
                      p.start >= 0 &&
                      p.end > p.start,
                  )
                  .map((p: any) => ({
                    block: p.block,
                    start: p.start,
                    end: p.end,
                  })),
              }
            : {}),
        };
      if (object(parsed.sources.readers))
        for (const [key, value] of Object.entries(parsed.sources.readers)) {
          if (!object(value)) continue;
          const highlights: Record<string, { start: number; end: number }[]> =
            {};
          if (object(value.highlights))
            for (const [block, ranges] of Object.entries(value.highlights)) {
              if (!Array.isArray(ranges)) continue;
              const valid = ranges
                .filter(
                  (r) =>
                    object(r) &&
                    Number.isInteger(r.start) &&
                    Number.isInteger(r.end) &&
                    r.start >= 0 &&
                    r.end > r.start,
                )
                .map((r) => ({ start: r.start, end: r.end }));
              if (valid.length) highlights[block] = valid;
            }
          result.sources.readers[key] = {
            top: bounded(value.top, 0),
            left: bounded(value.left, 0),
            zoom: [1, 1.25, 1.5, 2, 3].includes(value.zoom) ? value.zoom : 1,
            ...(["page", "width", "manual"].includes(value.fit)
              ? { fit: value.fit }
              : {}),
            transcript: value.transcript === true,
            highlights,
          };
        }
    }
  } catch {
    /* Ignore invalid local preferences. */
  }
  return result;
}
