export type RetrievalEvidence = {
  assessmentId: string;
  submittedAt: string;
  specification: string;
  topics: string[];
  awarded: number;
  available: number;
  assisted: boolean;
  mode: string;
};
export type RetrievalTask = {
  assessmentId: string;
  topic: string;
  specification: string;
  dueAt: string;
  intervalDays: number;
  completedAt: string | null;
};
/** Derived entirely from published evidence; recomputation also handles retrospective moderation. */
export function retrievalSchedule(
  evidence: RetrievalEvidence[],
): RetrievalTask[] {
  const tasks: RetrievalTask[] = [],
    active = new Map<string, RetrievalTask>();
  for (const row of [...evidence].sort((a, b) =>
    a.submittedAt.localeCompare(b.submittedAt),
  )) {
    for (const topic of new Set(row.topics)) {
      const key = `${row.specification}:${topic}`,
        previous = active.get(key),
        independent = !row.assisted && row.mode !== "guided";
      const success = row.available > 0 && row.awarded / row.available >= 0.8;
      if (previous) {
        if (
          !independent ||
          row.submittedAt < previous.dueAt ||
          row.assessmentId === previous.assessmentId
        )
          continue;
        previous.completedAt = row.submittedAt;
        active.delete(key);
        if (success && previous.intervalDays === 21) continue;
        const intervalDays = success
          ? previous.intervalDays === 3
            ? 7
            : 21
          : 3;
        const next = {
          assessmentId: row.assessmentId,
          topic,
          specification: row.specification,
          dueAt: new Date(
            new Date(row.submittedAt).getTime() + intervalDays * 86400000,
          ).toISOString(),
          intervalDays,
          completedAt: null,
        };
        tasks.push(next);
        active.set(key, next);
      } else if (!success) {
        const next = {
          assessmentId: row.assessmentId,
          topic,
          specification: row.specification,
          dueAt: new Date(
            new Date(row.submittedAt).getTime() + 3 * 86400000,
          ).toISOString(),
          intervalDays: 3,
          completedAt: null,
        };
        tasks.push(next);
        active.set(key, next);
      }
    }
  }
  return tasks;
}
