export type ComparableEvidence = {
  learnerId: string;
  familyId: string;
  name: string;
  id: string;
  at: string;
  key: string;
  label: string;
  awarded: number;
  available: number;
  topics: string[];
};
export function comparisonKey(data: any, mode: string, effective: any[]) {
  if (!effective?.length) return null;
  const questions = [...effective]
    .sort((a, b) => a.questionId.localeCompare(b.questionId))
    .map((r) => {
      const q = data.questions?.find((q: any) => q.id === r.questionId);
      if (!q?.rubric || r.available !== q.marks || r.rubricId !== q.rubric.id)
        return null;
      return {
        id: q.id,
        text: q.text,
        marks: q.marks,
        rubric: q.rubric,
        sources: (q.resourceIds ?? []).map((id: string) =>
          data.resources?.find((s: any) => s.id === id),
        ),
        extracts: q.extracts ?? [],
        seen: (data.seenQuestionIds ?? []).includes(q.id),
      };
    });
  if (questions.some((q) => !q)) return null;
  return JSON.stringify({
    subject: data.subject,
    specification: data.specification,
    mode,
    generalRubrics: data.generalRubrics ?? [],
    assisted: !!data.assisted,
    questions,
  });
}
export function compareEvidence(rows: ComparableEvidence[], key: string) {
  const byStudent = new Map<string, ComparableEvidence[]>();
  rows
    .filter((r) => r.key === key)
    .forEach((r) =>
      byStudent.set(r.learnerId, [...(byStudent.get(r.learnerId) ?? []), r]),
    );
  const students = [...byStudent.values()]
    .map((values) => {
      values.sort(
        (a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id),
      );
      const latest = values[0],
        percentage = (latest.awarded / latest.available) * 100;
      return {
        ...latest,
        percentage,
        count: values.length,
        change: values[1]
          ? percentage - (values[1].awarded / values[1].available) * 100
          : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const values = students.map((s) => s.percentage).sort((a, b) => a - b),
    n = values.length;
  return {
    students,
    count: n,
    median:
      n >= 3
        ? (values[Math.floor((n - 1) / 2)] + values[Math.floor(n / 2)]) / 2
        : null,
    range: n >= 3 ? [values[0], values[n - 1]] : null,
  };
}
