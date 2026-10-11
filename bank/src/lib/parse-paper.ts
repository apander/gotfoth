import { emptyFigure, figureClip, type GraphicBox } from "./figures";
import { markValue, partHeader, questionHeader, reflowRows, stripMark } from "./lines";
import type { ParsedExtract, ParsedPage, ParsedQuestion } from "./types";
import { commandWord, responseFormat, citedLetters, type TextRow } from "./lines";

export type PageText = {
  page: number;
  lines: string[];
  rows: TextRow[];
  boxes: GraphicBox[];
  hasFigure: boolean;
  width?: number;
  height?: number;
};

type Draft = {
  section: string;
  parent: number;
  part: string;
  lines: string[];
  lead: string[];
  marks: number | null;
  pages: number[];
};

export function parseQuestionPaper(pages: PageText[]): {
  pearsonCode: string;
  title: string;
  examDate: string | null;
  durationMinutes: number;
  totalMarks: number;
  instructions: string;
  component: string;
  bookletPage: number;
  sections: { label: string; marks: number; instruction: string }[];
  questions: Omit<ParsedQuestion, "scheme">[];
  extracts: ParsedExtract[];
  storedPages: ParsedPage[];
} {
  const cover = pages[0]?.lines.join(" ") ?? "";
  const bookletPage =
    pages.find((page) =>
      page.lines.some((line) => /do not return this booklet/i.test(line)),
    )?.page ?? pages.length + 1;
  const questionPages = pages.filter((page) => page.page < bookletPage && page.page > 1);
  const bookletPages = pages.filter((page) => page.page >= bookletPage);

  const drafts: Draft[] = [];
  let current: Draft | null = null;
  let lead: string[] = [];
  let section = "A";
  const sectionMeta = new Map<string, { instruction: string; marks: number }>();
  sectionMeta.set("A", { instruction: "", marks: 50 });
  sectionMeta.set("B", { instruction: "", marks: 50 });

  const flush = () => {
    if (!current) return;
    drafts.push(current);
    current = null;
  };

  for (const page of questionPages) {
    for (const line of page.lines) {
      const sectionMatch = line.match(/^SECTION\s+([AB])\b/i);
      if (sectionMatch) {
        flush();
        lead = [];
        section = sectionMatch[1].toUpperCase();
        continue;
      }
      if (/^TOTAL FOR SECTION/i.test(line)) {
        const marks = line.match(/(\d+)\s+MARKS/i);
        if (marks) sectionMeta.get(section)!.marks = Number(marks[1]);
        flush();
        lead = [];
        continue;
      }
      if (/^TOTAL FOR PAPER/i.test(line) || /^Answer ALL questions/i.test(line)) {
        flush();
        continue;
      }
      const header = questionHeader(line);
      const continued = header ? null : partHeader(line);
      if (header || continued) {
        flush();
        const part = header?.part ?? continued!.part;
        const parent = header?.parent ?? currentParent(drafts) ?? 1;
        const rest = stripMark(header?.rest ?? continued!.rest ?? "");
        current = {
          section,
          parent,
          part,
          lines: rest ? [rest] : [],
          lead: [...lead],
          marks: markValue(line),
          pages: [page.page],
        };
        lead = [];
        if (!current.pages.includes(page.page)) current.pages.push(page.page);
        continue;
      }
      if (/^Read(?: the)? extracts?/i.test(line) && !current) {
        const meta = sectionMeta.get(section)!;
        meta.instruction = meta.instruction ? `${meta.instruction} ${line}` : line;
        continue;
      }
      const marks = markValue(line);
      if (current && marks && /^\(\d{1,2}\)$/.test(line)) {
        current.marks = marks;
        if (!current.pages.includes(page.page)) current.pages.push(page.page);
        continue;
      }
      if (current && current.marks == null) {
        const cleaned = stripMark(line);
        if (cleaned) current.lines.push(cleaned);
        if (marks) current.marks = marks;
        if (!current.pages.includes(page.page)) current.pages.push(page.page);
        continue;
      }
      if (current?.marks != null) {
        lead.push(line);
        continue;
      }
    }
  }
  flush();

  const questions: Omit<ParsedQuestion, "scheme">[] = drafts.map((draft) => {
    const stem = [...draft.lead, ...draft.lines].join("\n").replace(/\n{3,}/g, "\n\n").trim();
    const marks = draft.marks ?? 0;
    return {
      section: draft.section,
      parent: draft.parent,
      part: draft.part,
      stem,
      command: commandWord(stem),
      marks,
      format: responseFormat(stem, marks),
      pages: [...new Set(draft.pages)],
      citedExtracts: citedLetters(stem),
    };
  });

  const extracts = parseExtracts(bookletPages);
  const storedPages: ParsedPage[] = [
    ...pages
      .filter((page) => page.page < bookletPage)
      .map((page) => ({
        role: "question_paper" as const,
        page: page.page,
        text: page.lines.join("\n"),
        hasFigure: page.hasFigure,
      })),
    ...bookletPages.map((page) => ({
      role: "source_booklet" as const,
      page: page.page,
      text: reflowRows(page.rows),
      hasFigure: page.hasFigure,
    })),
  ];

  return {
    pearsonCode: cover.match(/P\d+A/i)?.[0]?.toUpperCase() ?? "",
    title: titleFrom(cover),
    examDate: examDate(cover),
    durationMinutes: /2\s*hours/i.test(cover) ? 120 : 0,
    totalMarks: Number(cover.match(/total mark for this paper is\s+(\d+)/i)?.[1] ?? 100),
    instructions: instructionsFrom(pages[0]?.lines ?? []),
    component: componentFrom(cover),
    bookletPage,
    sections: [...sectionMeta.entries()].map(([label, meta]) => ({
      label,
      marks: meta.marks,
      instruction: meta.instruction,
    })),
    questions,
    extracts,
    storedPages,
  };
}

function currentParent(drafts: Draft[]): number | null {
  return drafts.at(-1)?.parent ?? null;
}

function titleFrom(cover: string): string {
  const match = cover.match(/PAPER\s+\d\s*:\s*(.+?)\s+You must have/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function componentFrom(cover: string): string {
  return cover.match(/9BS0\s*\/\s*(\d{2})/i)?.[1] ?? "";
}

function examDate(cover: string): string | null {
  const match = cover.match(
    /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})/i,
  );
  if (!match) return null;
  const months: Record<string, string> = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };
  const month = months[match[2].toLowerCase()];
  return `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
}

function instructionsFrom(lines: string[]): string {
  const start = lines.findIndex((line) => /^Instructions$/i.test(line));
  if (start < 0) return "";
  const end = lines.findIndex(
    (line, index) => index > start && /^(Information|Advice)$/i.test(line),
  );
  return lines.slice(start + 1, end < 0 ? start + 8 : end).join(" ").replace(/\s+/g, " ").trim();
}

function parseExtracts(pages: PageText[]): ParsedExtract[] {
  const extracts: ParsedExtract[] = [];
  let section = "A";
  let current: {
    label: string;
    rows: TextRow[];
    pages: number[];
    bands: Map<number, { rows: TextRow[]; boxes: GraphicBox[]; width: number; height: number }>;
  } | null = null;
  const flush = () => {
    const item = current;
    if (!item) return;
    const text = reflowRows(item.rows);
    const figures = [...item.bands.entries()].flatMap(([page, band]) => {
      const clip = figureClip(band.rows, band.boxes, { width: band.width, height: band.height });
      return clip && band.rows.length ? [emptyFigure(page, clip)] : [];
    });
    extracts.push({
      section,
      label: item.label,
      text,
      pageStart: Math.min(...item.pages),
      pageEnd: Math.max(...item.pages),
      needsFigure: figures.length > 0,
      figures,
    });
    current = null;
  };
  const ensureBand = (page: PageText) => {
    if (!current) return null;
    let band = current.bands.get(page.page);
    if (!band) {
      band = { rows: [], boxes: page.boxes, width: page.width ?? 595, height: page.height ?? 842 };
      current.bands.set(page.page, band);
      current.pages.push(page.page);
    }
    return band;
  };
  for (const page of pages) {
    for (const row of page.rows) {
      const line = row.text;
      const sectionMatch = line.match(/^SECTION\s+([AB])\b/i);
      if (sectionMatch) {
        flush();
        section = sectionMatch[1].toUpperCase();
        continue;
      }
      const extract = line.match(/^Extract\s+([A-I])\b/i);
      if (extract) {
        flush();
        const rest = line.replace(/^Extract\s+[A-I]\b/i, "").trim();
        current = {
          label: extract[1].toUpperCase(),
          rows: [],
          pages: [],
          bands: new Map(),
        };
        const band = ensureBand(page);
        if (rest && band) {
          const kept = { ...row, text: rest };
          current.rows.push(kept);
          band.rows.push(kept);
        }
        continue;
      }
      if (/^Read the following extracts/i.test(line)) continue;
      if (/^blank page$/i.test(line)) continue;
      if (!current) continue;
      current.rows.push(row);
      ensureBand(page)?.rows.push(row);
    }
  }
  flush();
  return extracts;
}
