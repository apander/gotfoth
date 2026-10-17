export function meaningfulAnswer(text: unknown): boolean {
  if (typeof text !== "string" || !text.trim()) return false;
  try {
    const value = JSON.parse(text);
    if (Array.isArray(value))
      return value
        .flat(Infinity)
        .some((cell) => String(cell ?? "").trim().length > 0);
  } catch {
    /* Ordinary prose is a valid answer. */
  }
  return true;
}
export function localWeek(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  const day = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}
export function completionSummary(
  rows: {
    attempt_id: string;
    submitted_at: string | Date;
    answers: { text: string }[];
  }[],
  timezone: string,
  now = new Date(),
) {
  const attempts = new Map<string, { date: Date; answered: boolean }>();
  for (const row of rows) {
    const date = new Date(row.submitted_at);
    if (date > now) continue;
    const previous = attempts.get(row.attempt_id);
    attempts.set(row.attempt_id, {
      date: previous && previous.date > date ? previous.date : date,
      answered:
        !!previous?.answered ||
        row.answers.some((a) => meaningfulAnswer(a.text)),
    });
  }
  const completed = [...attempts.entries()]
    .filter(([, a]) => a.answered)
    .sort((a, b) => b[1].date.getTime() - a[1].date.getTime());
  return {
    total: completed.length,
    weekly: completed.filter(
      ([, a]) => localWeek(a.date, timezone) === localWeek(now, timezone),
    ).length,
    week: localWeek(now, timezone),
    latestAttemptId: completed[0]?.[0] ?? null,
    milestones: [1, 5, 10].filter((n) => completed.length >= n),
  };
}
