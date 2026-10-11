import type { ParsedPaper } from "./types";

const PARTS = "abcdefghijklmnopqrstuvwxyz";

export function validatePaper(paper: ParsedPaper): string[] {
  const issues: string[] = [];
  if (!paper.component) issues.push("The cover does not name a 9BS0 component.");
  if (!paper.questionFile.sha256 || !paper.schemeFile.sha256)
    issues.push("The question paper and mark scheme must both be present.");
  if (paper.questions.length === 0) issues.push("No questions were read from the paper.");

  const seen = new Set<string>();
  for (const section of paper.sections) {
    const questions = paper.questions.filter((question) => question.section === section.label);
    const total = questions.reduce((sum, question) => sum + question.marks, 0);
    if (questions.length && total !== section.marks)
      issues.push(`Section ${section.label} totals ${total} marks, expected ${section.marks}.`);
    const letters = questions.map((question) => question.part);
    for (let index = 0; index < letters.length; index += 1) {
      if (letters[index] !== PARTS[index])
        issues.push(`Section ${section.label} part sequence breaks at (${letters[index]}).`);
    }
  }

  const paperTotal = paper.questions.reduce((sum, question) => sum + question.marks, 0);
  if (paper.questions.length && paperTotal !== paper.totalMarks)
    issues.push(`Paper totals ${paperTotal} marks, expected ${paper.totalMarks}.`);

  for (const question of paper.questions) {
    const label = `${question.parent}(${question.part})`;
    if (seen.has(label)) issues.push(`Question ${label} was read twice.`);
    seen.add(label);
    if (!question.marks) issues.push(`Question ${label} has no mark.`);
    if (!question.stem) issues.push(`Question ${label} has no stem.`);
    if (!question.command) issues.push(`Question ${label} has no command word.`);
    for (const letter of question.citedExtracts) {
      if (
        !paper.extracts.some(
          (extract) => extract.section === question.section && extract.label === letter,
        )
      )
        issues.push(
          `Question ${label} cites Extract ${letter}, which is not in section ${question.section}.`,
        );
    }
    const scheme = question.scheme;
    if (!scheme) {
      issues.push(`Question ${label} has no mark scheme entry.`);
      continue;
    }
    const objectiveTotal =
      scheme.knowledge + scheme.application + scheme.analysis + scheme.evaluation;
    if (objectiveTotal !== question.marks)
      issues.push(
        `Question ${label} assessment objectives total ${objectiveTotal}, expected ${question.marks}.`,
      );
    if (scheme.style === "points") {
      const creditTotal = scheme.credits.reduce((sum, credit) => sum + credit.marks, 0);
      if (creditTotal !== question.marks)
        issues.push(`Question ${label} point credits total ${creditTotal}, expected ${question.marks}.`);
      if (scheme.credits.length === 0) issues.push(`Question ${label} has no point credits.`);
    } else {
      if (scheme.indicative.length === 0)
        issues.push(`Question ${label} has no indicative content.`);
      const top = Math.max(0, ...scheme.bands.map((band) => band.max));
      if (top !== question.marks)
        issues.push(`Question ${label} level bands reach ${top}, expected ${question.marks}.`);
    }
  }

  if (paper.extracts.length === 0) issues.push("No source extracts were read.");
  return issues;
}
