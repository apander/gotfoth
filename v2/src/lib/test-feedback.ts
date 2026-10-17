import type { Question, Result } from "./contracts";
export function simulatedFeedback(question: Question, answer: string): Result {
  const text = answer.trim();
  return {
    questionId: question.id,
    rubricId: question.rubric.id,
    awarded: text ? Math.max(1, Math.floor(question.marks * 0.6)) : 0,
    available: question.marks,
    evidence: text
      ? [
          {
            quote: text.slice(0, Math.min(80, text.length)),
            rubricReference: question.rubric.text,
          },
        ]
      : [],
    justification:
      "Simulated UX test feedback. This does not assess learning or exam readiness.",
    achievements: text
      ? ["You completed a response in the test workflow."]
      : [],
    improvement:
      "Add a clear explanation and a specific example, then ask the test teacher to review it.",
    uncertainty: ["Synthetic test result: teacher review required."],
  };
}
