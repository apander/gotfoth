export type PdfItem = { str?: string; transform?: number[]; width?: number };

const LONE_MARK = /^\(\d{1,2}\)$/;
const BOX_CHARS = /[\uE000-\uF8FF\u25A0-\u25FF\u2610\u2611\u2B1A-\u2B1C\uFFFD]/g;

function stripBoxes(text: string): string {
  return text.replace(BOX_CHARS, " ").replace(/\s+/g, " ").trim();
}

export type TextRow = { y: number; text: string; left?: number; right?: number };

export function textRows(
  items: PdfItem[],
  options: { dropLoneNumbers?: boolean } = {},
): TextRow[] {
  const rows: { y: number; parts: { x: number; s: string; w: number }[] }[] = [];
  for (const item of items) {
    const raw = item.str ?? "";
    if (!keepItem(raw)) continue;
    const transform = item.transform ?? [0, 0, 0, 0, 0, 0];
    const x = transform[4] ?? 0;
    const y = transform[5] ?? 0;
    const token = raw.trim();
    if (x > 530 && /^\d{1,2}$/.test(token)) continue;
    if (x > 480 && !/\d/.test(token)) continue;
    let row = rows.find((candidate) => Math.abs(candidate.y - y) < 2.2);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    const width = item.width && item.width > 0 ? item.width : token.length * 4.2;
    row.parts.push({ x, s: token, w: width });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      const parts = row.parts.sort((a, b) => a.x - b.x);
      const last = parts.at(-1);
      return {
        y: row.y,
        left: parts[0]?.x ?? 0,
        right: (last?.x ?? 0) + (last?.w ?? 0),
        text: parts
          .map((part) => part.s)
          .join(" ")
          .replace(BOX_CHARS, " ")
          .replace(/\s+/g, " ")
          .trim(),
      };
    })
    .filter((row) => keepLine(row.text, options.dropLoneNumbers === true));
}

export function textLines(
  items: PdfItem[],
  options: { dropLoneNumbers?: boolean } = {},
): string[] {
  return textRows(items, options).map((row) => row.text);
}

export function reflowRows(rows: TextRow[]): string {
  const paragraphs: string[] = [];
  let current = "";
  let previousY: number | null = null;
  for (const row of rows) {
    const text = row.text.trim();
    if (!text) continue;
    if (!current || previousY == null) {
      current = text;
      previousY = row.y;
      continue;
    }
    const gap = previousY - row.y;
    if (gap > 18) {
      paragraphs.push(current);
      current = text;
    } else if (continuesTight(current)) {
      current += text;
    } else {
      current = `${current} ${text}`;
    }
    previousY = row.y;
  }
  if (current) paragraphs.push(current);
  return paragraphs.join("\n");
}

function continuesTight(text: string): boolean {
  return /https?:\/\//i.test(text) || /[-/]$/.test(text) || /%[\da-f]{2}$/i.test(text);
}

function keepItem(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  if (LONE_MARK.test(text)) return true;
  if (!stripBoxes(text)) return false;
  if (/DO NOT WRITE/i.test(text)) return false;
  if (/^Turn over$/i.test(text)) return false;
  if (/\*P\d+/i.test(text) || /^P\d{4,}A$/i.test(text)) return false;
  const dots = (text.match(/[.\u2026\u00B7]/g) ?? []).length;
  if (dots / text.length > 0.6) return false;
  return true;
}

function keepLine(line: string, dropLoneNumbers: boolean): boolean {
  if (line.length < 2 && !LONE_MARK.test(line)) return false;
  if (!stripBoxes(line)) return false;
  if (dropLoneNumbers && /^\d{1,2}$/.test(line)) return false;
  const dots = (line.match(/[.\u2026]/g) ?? []).length;
  if (dots / line.length > 0.5) return false;
  return true;
}

export function questionHeader(line: string): {
  parent: number;
  part: string;
  rest: string;
} | null {
  const match = line.match(/^([12])\s*\(([a-e])\)\s*(.*)$/i);
  if (!match) return null;
  return {
    parent: Number(match[1]),
    part: match[2].toLowerCase(),
    rest: (match[3] ?? "").trim(),
  };
}

export function partHeader(line: string): { part: string; rest: string } | null {
  const match = line.match(/^\(([a-e])\)\s*(.*)$/i);
  if (!match) return null;
  return { part: match[1].toLowerCase(), rest: (match[2] ?? "").trim() };
}

export function markValue(line: string): number | null {
  const whole = line.match(/^\((\d{1,2})\)$/);
  if (whole) return plausible(Number(whole[1]));
  const end = line.match(/\((\d{1,2})\)\s*$/);
  if (!end) return null;
  return plausible(Number(end[1]));
}

function plausible(marks: number): number | null {
  return marks >= 1 && marks <= 30 ? marks : null;
}

export function stripMark(line: string): string {
  return line.replace(/\s*\(\d{1,2}\)\s*$/, "").trim();
}

export function citedLetters(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(
    /Extracts?\s+\(?([A-I]\b(?:\s*(?:,|and|to)\s*\(?[A-I]\b)*)/gi,
  )) {
    for (const letter of expandLetters(match[1] ?? "")) found.add(letter);
  }
  return [...found];
}

export function expandLetters(expression: string): string[] {
  const letters: string[] = [];
  for (const piece of expression.split(/\s*,\s*|\s+and\s+/i)) {
    const range = piece.trim().match(/^([A-I])\s+to\s+([A-I])$/i);
    if (range) {
      const start = range[1].toUpperCase().charCodeAt(0);
      const end = range[2].toUpperCase().charCodeAt(0);
      for (let code = start; code <= end; code += 1)
        letters.push(String.fromCharCode(code));
      continue;
    }
    const one = piece.match(/[A-I]/i);
    if (one) letters.push(one[0].toUpperCase());
  }
  return letters;
}

const COMMANDS = ["calculate", "explain", "draw", "assess", "evaluate"] as const;

export function commandWord(stem: string): string {
  const lower = stem.toLowerCase();
  const found = COMMANDS.find((command) => new RegExp(`\\b${command}\\b`).test(lower));
  return found ?? "";
}

export function responseFormat(stem: string, marks: number): ParsedFormat {
  const command = commandWord(stem);
  if (command === "draw") return "diagram";
  if (command === "calculate") return "calculation";
  if (command === "explain") return "short";
  if (command === "assess" || command === "evaluate" || marks >= 8) return "levels";
  return "short";
}

type ParsedFormat = "calculation" | "short" | "diagram" | "levels";

export function stableId(component: string, parent: number, part: string): string {
  return `9bs0-${component}-2025-06-${parent}${part}`;
}
