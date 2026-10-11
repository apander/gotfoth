import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { renderFigures } from "./figures";
import { parseQuestionPaper } from "./parse-paper";
import { parseMarkScheme } from "./parse-scheme";
import { readPdf } from "./read-pdf";
import type { ParsedPaper, ParsedQuestion } from "./types";
import { validatePaper } from "./validate";

export async function parsePair(questionPath: string, schemePath: string): Promise<ParsedPaper> {
  const [questionPdf, schemePdf, questionBytes, schemeBytes] = await Promise.all([
    readPdf(questionPath, true),
    readPdf(schemePath, false),
    readFile(questionPath),
    readFile(schemePath),
  ]);
  const questionPages = questionPdf.pages;
  const schemePages = schemePdf.pages;
  const question = parseQuestionPaper(questionPages);
  await renderFigures(questionPath, question.extracts);
  const scheme = parseMarkScheme(schemePages.map((page) => ({ page: page.page, lines: page.lines })));
  const questions: ParsedQuestion[] = question.questions.map((item) => ({
    ...item,
    scheme: scheme.items.get(`${item.parent}${item.part}`) ?? null,
  }));
  const schemeDate = schemePath.match(/(20\d{2})(\d{2})(\d{2})/) ?? null;
  const paper: ParsedPaper = {
    component: question.component || componentFromName(questionPath),
    pearsonCode: questionPdf.pearsonCode || question.pearsonCode,
    title: question.title,
    examDate: question.examDate,
    durationMinutes: question.durationMinutes,
    totalMarks: question.totalMarks,
    instructions: question.instructions,
    schemeDate: schemeDate
      ? `${schemeDate[1]}-${schemeDate[2]}-${schemeDate[3]}`
      : null,
    questionFile: {
      filename: basename(questionPath),
      path: questionPath,
      sha256: createHash("sha256").update(questionBytes).digest("hex"),
      pageCount: questionPages.length,
    },
    schemeFile: {
      filename: basename(schemePath),
      path: schemePath,
      sha256: createHash("sha256").update(schemeBytes).digest("hex"),
      pageCount: schemePages.length,
    },
    bookletPage: question.bookletPage,
    sections: question.sections,
    extracts: question.extracts,
    questions,
    pages: [
      ...question.storedPages,
      ...schemePages.map((page) => ({
        role: "mark_scheme" as const,
        page: page.page,
        text: page.lines.join("\n"),
        hasFigure: page.hasFigure,
      })),
    ],
    guidance: scheme.guidance,
    issues: [],
  };
  paper.issues = validatePaper(paper);
  return paper;
}

function componentFromName(path: string): string {
  return basename(path).match(/9bs0-(\d{2})/i)?.[1] ?? "";
}

export function pairFiles(paths: string[]): { question: string; scheme: string; component: string }[] {
  const questions = new Map<string, string>();
  const schemes = new Map<string, string>();
  for (const path of paths) {
    const name = basename(path).toLowerCase();
    const component = name.match(/9bs0-(\d{2})/)?.[1];
    if (!component || !name.endsWith(".pdf")) continue;
    if (name.includes("-que-")) questions.set(component, path);
    if (name.includes("-rms-")) schemes.set(component, path);
  }
  return [...questions.keys()].sort().flatMap((component) => {
    const question = questions.get(component);
    const scheme = schemes.get(component);
    return question && scheme ? [{ question, scheme, component }] : [];
  });
}
