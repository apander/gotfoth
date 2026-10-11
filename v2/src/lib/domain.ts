import { createHash } from "node:crypto";
import { requireThat } from "./errors";
import {
  Paper,
  Question,
  Result,
  type Mode,
  type Enrolment,
} from "./contracts";
export function validatePaper(paper: Paper): string[] {
  const issues: string[] = [];
  const ids = new Set(paper.questions.map((q) => q.id));
  if (ids.size !== paper.questions.length)
    issues.push("Duplicate question identifiers.");
  const resources = new Set(paper.resources.map((r) => r.id));
  const grouped = new Set<string>();
  let total = paper.questions
    .filter((q) => !q.choiceGroup)
    .reduce((n, q) => n + q.marks, 0);
  for (const choice of paper.choices) {
    const qs = choice.questionIds.map((id) =>
      paper.questions.find((q) => q.id === id),
    );
    if (qs.some((q) => !q) || choice.choose > qs.length) {
      issues.push(`Invalid choice ${choice.id}.`);
      continue;
    }
    for (const q of qs) {
      if (grouped.has(q!.id) || q!.choiceGroup !== choice.id)
        issues.push(`Choice membership mismatch: ${q!.id}.`);
      grouped.add(q!.id);
    }
    // Every allowed route must have the same denominator; combinations are unnecessary when all options carry equal marks.
    if (new Set(qs.map((q) => q!.marks)).size !== 1)
      issues.push(`Unequal optional route totals: ${choice.id}.`);
    total += qs[0]!.marks * choice.choose;
  }
  for (const q of paper.questions) {
    if (q.choiceGroup && !grouped.has(q.id))
      issues.push(`Missing choice group: ${q.id}.`);
    if (q.resourceIds.some((id) => !resources.has(id)))
      issues.push(`Missing resource: ${q.id}.`);
    if (
      q.topicAllocations &&
      (Object.values(q.topicAllocations).reduce((a, b) => a + b, 0) !==
        q.marks ||
        Object.keys(q.topicAllocations).some((t) => !q.topics.includes(t)))
    )
      issues.push(`Invalid topic allocation: ${q.id}.`);
    if (paper.fullMockEligible && (!q.eligible || q.format === "unsupported"))
      issues.push(`Unsupported full-mock response: ${q.id}.`);
  }
  if (total !== paper.totalMarks)
    issues.push(
      `Route total ${total} differs from paper total ${paper.totalMarks}.`,
    );
  if ((paper.subject === "psychology") !== (paper.qualification === "YPS01"))
    issues.push("Subject and qualification do not match.");
  return issues;
}
export function selectedQuestions(paper: Paper, selected: string[]) {
  requireThat(
    new Set(selected).size === selected.length,
    "CHOICES",
    "Duplicate choices.",
  );
  requireThat(
    selected.every((id) => paper.questions.some((q) => q.id === id)),
    "CHOICES",
    "Unknown question.",
  );
  const chosen = paper.questions.filter(
    (q) => !q.choiceGroup || selected.includes(q.id),
  );
  for (const group of paper.choices)
    requireThat(
      chosen.filter((q) => q.choiceGroup === group.id).length === group.choose,
      "CHOICES",
      `Choose ${group.choose} response(s) in ${group.id}.`,
    );
  return chosen;
}
export function validateResult(result: Result, q: Question, answer: string) {
  Result.parse(result);
  requireThat(
    result.questionId === q.id &&
      result.rubricId === q.rubric.id &&
      result.available === q.marks &&
      result.awarded <= q.marks,
    "INVALID_MARK",
    "Marks or rubric references do not match.",
  );
  requireThat(
    result.awarded === 0 || result.evidence.length > 0,
    "INVALID_EVIDENCE",
    "An awarded mark requires answer evidence.",
  );
  requireThat(
    result.evidence.every(
      (e) =>
        answer.includes(e.quote) && q.rubric.text.includes(e.rubricReference),
    ),
    "INVALID_EVIDENCE",
    "Evidence must quote the submitted answer and approved rubric exactly.",
  );
  return result;
}
export function needsReview(
  q: Question,
  result: Result,
  submissionId: string,
  boundarySensitive = false,
) {
  const sample =
    parseInt(
      createHash("sha256")
        .update(`${submissionId}:${q.id}`)
        .digest("hex")
        .slice(0, 8),
      16,
    ) %
      10 ===
    0;
  return (
    (q.rubric.levels && q.marks >= 8) ||
    result.uncertainty.length > 0 ||
    sample ||
    boundarySensitive
  );
}
export function studentQuestion(q: Question, mode: Mode, hints = false) {
  const { rubric: _rubric, hints: approved, ...safe } = q;
  return { ...safe, hints: mode === "guided" && hints ? approved : [] };
}
export function reservedPapers(
  papers: Paper[],
  released: string[] = [],
): Set<string> {
  const groups = Map.groupBy(
    papers.filter((p) => p.fullMockEligible && !released.includes(p.id)),
    (p) => p.unit,
  );
  return new Set(
    [...groups.values()].flatMap((ps) =>
      ps
        .sort(
          (a, b) =>
            b.year - a.year ||
            ["January", "June", "October"].indexOf(b.session) -
              ["January", "June", "October"].indexOf(a.session),
        )
        .slice(0, 2)
        .map((p) => p.id),
    ),
  );
}
export function chooseQuestions(
  papers: Paper[],
  course: Enrolment,
  count: number,
  gaps: string[],
  due: string[],
  seen: Set<string>,
  released: string[] = [],
) {
  const compatible = papers.filter(
    (p) =>
      p.subject === course.subject &&
      p.compatibleSpecifications.includes(course.specification),
  );
  compatible.sort(
    (a, b) =>
      Number(/WPS0[34]|WBS1[34]/.test(b.unit)) -
        Number(/WPS0[34]|WBS1[34]/.test(a.unit)) ||
      b.year - a.year ||
      a.id.localeCompare(b.id),
  );
  const reserved = reservedPapers(compatible, released);
  const pool = compatible
    .filter((p) => !reserved.has(p.id))
    .flatMap((p) =>
      p.questions
        .filter(
          (q) =>
            q.eligible &&
            q.format !== "unsupported" &&
            q.topics.every((t) => course.taughtTopics.includes(t)) &&
            (!q.option || q.option === course.option) &&
            (!seen.has(q.id) || q.topics.some((t) => due.includes(t))),
        )
        .map((q) => ({ paper: p, question: q })),
    );
  const selected: typeof pool = [];
  let marks = 0;
  const budget = Math.max(1, count);
  for (const [topics, share] of [
    [gaps, 0.6],
    [due, 0.2],
    [course.taughtTopics, 0.2],
  ] as const) {
    let part = 0;
    for (const item of pool)
      if (
        !selected.includes(item) &&
        item.question.topics.some((t) => topics.includes(t)) &&
        part < budget * share
      ) {
        selected.push(item);
        part += item.question.marks;
        marks += item.question.marks;
      }
  }
  for (const item of pool)
    if (!selected.includes(item) && marks < budget) {
      selected.push(item);
      marks += item.question.marks;
    }
  return selected;
}
export type HistoryEvidence = {
  submissionId: string;
  questionId: string;
  submittedAt: string;
  mode: Mode;
  assisted: boolean;
  seen: boolean;
  specification: string;
  topics: string[];
  awarded: number;
  available: number;
  feedback: string;
};
export function aggregateHistory(rows: HistoryEvidence[], topics: Set<string>) {
  const unique = [
    ...new Map(
      rows
        .filter((r) => r.topics.some((t) => topics.has(t)))
        .map((r) => [`${r.submissionId}:${r.questionId}`, r]),
    ).values(),
  ];
  // Mixed-topic evidence remains labelled; no fabricated per-topic apportionment.
  const groups = Map.groupBy(unique, (r) => r.submissionId);
  return [...groups.entries()]
    .map(([submissionId, evidence]) => {
      const awarded = evidence.reduce((n, r) => n + r.awarded, 0),
        available = evidence.reduce((n, r) => n + r.available, 0);
      return {
        submissionId,
        submittedAt: evidence[0].submittedAt,
        awarded,
        available,
        percentage: available ? (100 * awarded) / available : null,
        questionCount: evidence.length,
        mixed: evidence.some((r) => r.topics.length > 1),
        evidence,
      };
    })
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}
export function isSuperuser(
  email: string,
  verified: boolean,
  configured = process.env.SUPERUSER_EMAIL,
) {
  return (
    verified &&
    !!configured &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configured) &&
    email.toLowerCase() === configured.toLowerCase()
  );
}
