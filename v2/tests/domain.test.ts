import test from "node:test";
import assert from "node:assert/strict";
import {
  isSuperuser,
  validatePaper,
  validateResult,
  aggregateHistory,
  selectedQuestions,
  needsReview,
  chooseQuestions,
} from "../src/lib/domain";
import { zonedInstant } from "../src/server/planning";
import { evaluateReference } from "../src/server/marking";
import type { Paper, Question, Result, Enrolment } from "../src/lib/contracts";
const q: Question = {
  id: "q1",
  number: "1",
  text: "Explain a limitation.",
  marks: 8,
  format: "essay",
  section: "A",
  resourceIds: [],
  topics: ["research.methods", "evaluation"],
  command: "Explain",
  objectives: [],
  rubric: {
    id: "r1",
    text: "Credit valid explanation with evidence.",
    levels: true,
    pages: [2],
  },
  pages: [3],
  hints: [],
  eligible: true,
};
const paper: Paper = {
  id: "p1",
  version: 1,
  subject: "psychology",
  qualification: "YPS01",
  specification: "2026",
  unit: "WPS03",
  year: 2025,
  session: "June",
  variant: "01",
  title: "Fixture",
  durationMinutes: 90,
  totalMarks: 8,
  instructions: "Answer all.",
  generalRubric: "Use the rubric.",
  permittedMaterials: "None",
  resources: [],
  questions: [q],
  choices: [],
  compatibleSpecifications: ["2026"],
  sourceIds: ["a", "b"],
  fullMockEligible: true,
  permissionConfirmed: false,
};
const result: Result = {
  questionId: "q1",
  rubricId: "r1",
  awarded: 5,
  available: 8,
  evidence: [
    { quote: "sample is small", rubricReference: "valid explanation" },
  ],
  justification: "Supported.",
  achievements: ["Explained the limitation."],
  improvement: "Support the evaluation.",
  uncertainty: [],
};
test("selection prioritises IA2, permits due retests and protects reserved mocks", () => {
  const course: Enrolment = {
    subject: "psychology",
    specification: "2026",
    targetSession: "June 2027",
    taughtTopics: q.topics,
    option: "health",
    timezone: "Europe/Amsterdam",
    extraTimePercent: 0,
    sessionMinutes: 20,
    availability: [],
    examDates: [],
    blockedDates: [],
  };
  const ias: Paper = {
    ...paper,
    id: "ias",
    unit: "WPS01",
    fullMockEligible: false,
    questions: [{ ...q, id: "ias-q" }],
  };
  const ia2: Paper = { ...paper, id: "ia2", fullMockEligible: false };
  assert.equal(
    chooseQuestions([ias, ia2], course, 8, [], [], new Set())[0].paper.id,
    "ia2",
  );
  assert.equal(
    chooseQuestions([ia2], course, 8, [], [], new Set([q.id])).length,
    0,
  );
  assert.equal(
    chooseQuestions([ia2], course, 8, [], [q.topics[0]], new Set([q.id]))
      .length,
    1,
  );
  assert.equal(
    chooseQuestions([paper], course, 8, [], [q.topics[0]], new Set([q.id]))
      .length,
    0,
  );
});
test("superuser authority follows verified server configuration only", () => {
  assert.equal(isSuperuser("a@example.com", true, "a@example.com"), true);
  assert.equal(isSuperuser("a@example.com", false, "a@example.com"), false);
  assert.equal(isSuperuser("a@example.com", true, "b@example.com"), false);
  assert.equal(isSuperuser("a@example.com", true, ""), false);
});
test("rubric evidence, identifiers, ranges and independent routing are validated", () => {
  assert.deepEqual(validateResult(result, q, "The sample is small."), result);
  assert.throws(() =>
    validateResult({ ...result, awarded: 9 }, q, "The sample is small."),
  );
  assert.throws(() =>
    validateResult(
      {
        ...result,
        evidence: [{ quote: "invented", rubricReference: "valid explanation" }],
      },
      q,
      "The sample is small.",
    ),
  );
  assert.equal(needsReview(q, result, "s1"), true);
});
test("all allowed routes reconcile and unsupported full mocks are blocked", () => {
  assert.deepEqual(validatePaper(paper), []);
  assert.ok(validatePaper({ ...paper, totalMarks: 9 }).length);
  assert.ok(
    validatePaper({ ...paper, questions: [{ ...q, format: "unsupported" }] })
      .length,
  );
  const choicePaper = {
    ...paper,
    questions: [
      { ...q, choiceGroup: "c" },
      { ...q, id: "q2", choiceGroup: "c" },
    ],
    choices: [{ id: "c", choose: 1, questionIds: ["q1", "q2"] }],
  };
  assert.deepEqual(validatePaper(choicePaper), []);
  assert.throws(() => selectedQuestions(choicePaper, []));
  assert.equal(selectedQuestions(choicePaper, ["q2"]).length, 1);
});
test("history weights marks, deduplicates mixed-topic evidence and preserves submission date", () => {
  const base = {
    submissionId: "s",
    submittedAt: "2026-01-02T10:00:00Z",
    mode: "independent" as const,
    assisted: false,
    seen: false,
    specification: "2026",
    feedback: "",
  };
  const a = {
    ...base,
    questionId: "1",
    topics: ["a", "a.b"],
    awarded: 1,
    available: 2,
  };
  const b = {
    ...base,
    questionId: "2",
    topics: ["a"],
    awarded: 6,
    available: 8,
  };
  const rows = aggregateHistory([a, a, b], new Set(["a", "a.b"]));
  assert.equal(rows[0].percentage, 70);
  assert.equal(rows[0].questionCount, 2);
  assert.equal(rows[0].mixed, true);
  assert.equal(rows[0].submittedAt, base.submittedAt);
});
test("DST nonexistent wall times are not silently scheduled", () => {
  assert.equal(zonedInstant("2026-03-29", "02:30", "Europe/Amsterdam"), null);
  assert.equal(
    zonedInstant("2026-10-26", "17:00", "Europe/Amsterdam"),
    "2026-10-26T16:00:00.000Z",
  );
});
test("evaluation requires ten scripts, 100 responses and bounded full-paper error", () => {
  assert.equal(evaluateReference([]).passed, false);
  const rows = Array.from({ length: 100 }, (_, i) => ({
    script: String(Math.floor(i / 10)),
    awarded: 5,
    reference: 5,
    available: 10,
  }));
  assert.equal(evaluateReference(rows).passed, true);
  rows[0].awarded = 0;
  rows[1].awarded = 0;
  rows[2].awarded = 0;
  assert.equal(evaluateReference(rows).passed, false);
});
