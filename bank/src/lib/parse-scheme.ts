import { questionHeader, textLines, type PdfItem } from "./lines";
import type {
  CreditStrand,
  IndicativeRole,
  ParsedBand,
  ParsedCredit,
  ParsedIndicative,
  ParsedScheme,
} from "./types";

export type SchemePage = { page: number; lines: string[] };

const RANGE = /(\d+)\s*[\u2010-\u2015\-]\s*(\d+)/;

export function parseMarkScheme(pages: SchemePage[]): {
  guidance: string;
  items: Map<string, ParsedScheme>;
} {
  const lines = pages.flatMap((page) => page.lines);
  const blocks: { key: string; lines: string[] }[] = [];
  let guidance: string[] = [];
  let current: { key: string; lines: string[] } | null = null;
  for (const line of lines) {
    const header = questionHeader(line);
    if (header) {
      if (current) blocks.push(current);
      current = {
        key: `${header.parent}${header.part}`,
        lines: header.rest ? [header.rest] : [],
      };
      continue;
    }
    if (!current) {
      if (!/^(Question|Number|Answer|Mark|Indicative content)$/i.test(line))
        guidance.push(line);
      continue;
    }
    current.lines.push(line);
  }
  if (current) blocks.push(current);
  const items = new Map<string, ParsedScheme>();
  for (const block of blocks) items.set(block.key, schemeFrom(block.lines));
  return { guidance: guidance.join("\n").trim(), items };
}

function schemeFrom(lines: string[]): ParsedScheme {
  const sourceText = lines.join("\n").trim();
  const objectives = objectivesFrom(sourceText);
  const quantitativeSkills = [
    ...sourceText.matchAll(/\bQS\s*(\d+)\b/gi),
  ].map((match) => `QS${match[1]}`);
  const levelStart = lines.findIndex(
    (line) => /^Level\s+\d+\s+\d+/i.test(line) || /^Level Mark Descriptor$/i.test(line),
  );
  const style = levelStart >= 0 ? "levels" : "points";
  if (style === "levels") {
    const body = lines.slice(0, levelStart < 0 ? lines.length : levelStart);
    const bands = bandsFrom(lines.slice(Math.max(levelStart, 0)));
    return {
      style,
      ...objectives,
      quantitativeSkills: [...new Set(quantitativeSkills)],
      sourceText,
      credits: [],
      indicative: indicativeFrom(body),
      bands,
    };
  }
  return {
    style,
    ...objectives,
    quantitativeSkills: [...new Set(quantitativeSkills)],
    sourceText,
    credits: creditsFrom(lines, objectives),
    indicative: [],
    bands: [],
  };
}

function objectivesFrom(text: string): {
  knowledge: number;
  application: number;
  analysis: number;
  evaluation: number;
} {
  const match = text.match(
    /Knowledge\s+(\d+)\s*,\s*Application\s+(\d+)(?:\s*,\s*Analysis\s+(\d+))?(?:\s*,\s*Evaluation\s+(\d+))?/i,
  );
  return {
    knowledge: Number(match?.[1] ?? 0),
    application: Number(match?.[2] ?? 0),
    analysis: Number(match?.[3] ?? 0),
    evaluation: Number(match?.[4] ?? 0),
  };
}

function bandsFrom(lines: string[]): ParsedBand[] {
  const bands: ParsedBand[] = [];
  let current: ParsedBand | null = null;
  const flush = () => {
    if (!current) return;
    current.descriptor = current.descriptor.replace(/\s+/g, " ").trim();
    if (current.descriptor) bands.push(current);
    current = null;
  };
  for (const line of lines) {
    if (/^Level Mark Descriptor$/i.test(line)) continue;
    const ranged = line.match(/^Level\s+(\d+)\s+(\d+)\s*[\u2010-\u2015\-]\s*(\d+)\s*(.*)$/i);
    if (ranged) {
      flush();
      current = {
        level: Number(ranged[1]),
        min: Number(ranged[2]),
        max: Number(ranged[3]),
        descriptor: cleanDescriptor(ranged[4] ?? ""),
      };
      continue;
    }
    const zero = line.match(/^(?:Level\s+)?0\s*[•\-]?\s*(A completely inaccurate response.*)$/i);
    if (zero) {
      flush();
      current = { level: 0, min: 0, max: 0, descriptor: cleanDescriptor(zero[1] ?? line) };
      continue;
    }
    if (!current || isBandChrome(line)) continue;
    current.descriptor = `${current.descriptor} ${cleanDescriptor(line)}`.trim();
  }
  flush();
  return bands;
}

function cleanDescriptor(text: string): string {
  return text
    .replace(/^[•\-]\s*/, "")
    .replace(/\s*(?:Question\s+)?Indicative content(?:\s+Mark)?(?:\s+Number)?\s*$/i, "")
    .trim();
}

function isBandChrome(line: string): boolean {
  return (
    /^(Question|Number|Answer|Mark)$/i.test(line) ||
    /^Indicative content\b/i.test(line) ||
    /^Question\s+Indicative content\b/i.test(line)
  );
}

function indicativeFrom(lines: string[]): ParsedIndicative[] {
  const points: ParsedIndicative[] = [];
  let role: IndicativeRole = "application";
  let sawDefinition = false;
  let skippingHeading = false;
  let openNote = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || skipSchemeChrome(line)) continue;
    const bullet = /^[•\-]\s*/.test(line);
    if (openNote && !bullet && !/^potential (counterbalance|judgement)/i.test(line)) {
      const note = points.at(-1);
      if (note?.role === "note") note.text = `${note.text} ${line}`;
      continue;
    }
    openNote = false;
    if (/^potential counterbalance/i.test(line)) {
      role = "counterbalance";
      skippingHeading = true;
      continue;
    }
    if (/^potential judgement/i.test(line)) {
      role = "judgement";
      skippingHeading = true;
      continue;
    }
    if (/^NB\b/i.test(line)) {
      points.push({ role: "note", text: line });
      openNote = true;
      skippingHeading = false;
      continue;
    }
    if (
      /^(positive|negative) consequences/i.test(line) ||
      /^consequences of/i.test(line) ||
      /^knowledge\b/i.test(line)
    ) {
      role = "application";
      skippingHeading = true;
      continue;
    }
    const text = line.replace(/^[•\-]\s*/, "").trim();
    if (!text) continue;
    if (skippingHeading && !bullet && text.split(/\s+/).length <= 3 && !/[.?!]/.test(text)) continue;
    skippingHeading = false;
    if (!bullet) {
      const previous = points.at(-1);
      if (previous && previous.role !== "note") {
        previous.text = `${previous.text} ${text}`;
        continue;
      }
    }
    let used: IndicativeRole = role;
    if (!sawDefinition && role === "application" && /\b(is|means|refers to)\b/i.test(text)) {
      used = "definition";
      sawDefinition = true;
    }
    points.push({ role: used, text });
  }
  return points;
}

function creditsFrom(
  lines: string[],
  objectives: { knowledge: number; application: number; analysis: number; evaluation: number },
): ParsedCredit[] {
  const buckets = new Map<CreditStrand, string[]>();
  const notes: string[] = [];
  let strand: CreditStrand | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || skipSchemeChrome(line)) continue;
    if (/^NB\b/i.test(line)) {
      notes.push(line);
      continue;
    }
    const heading = line.match(/^(Knowledge|Application|Analysis|Evaluation)\b/i);
    if (heading) {
      strand = heading[1].toLowerCase() as CreditStrand;
      const rest = line
        .replace(/^(Knowledge|Application|Analysis|Evaluation)\b[:\s]*/i, "")
        .replace(/^(?:\/understanding)?[:\s]*/i, "")
        .replace(/\d+\s*marks?\b/i, "")
        .replace(/^up to\s+/i, "")
        .replace(/^for\s+/i, "")
        .trim();
      if (rest) {
        const list = buckets.get(strand) ?? [];
        list.push(rest);
        buckets.set(strand, list);
      } else if (!buckets.has(strand)) buckets.set(strand, []);
      continue;
    }
    if (!strand) continue;
    const text = line.replace(/^[•\-]\s*/, "").replace(/\(\d+\)\s*$/, "").trim();
    if (!text) continue;
    buckets.get(strand)!.push(text);
  }
  const awardNote = notes.join(" ");
  const strands: CreditStrand[] = ["knowledge", "application", "analysis", "evaluation"];
  const credits: ParsedCredit[] = [];
  let noteUsed = false;
  for (const name of strands) {
    const marks = objectives[name];
    if (!marks) continue;
    const examples = (buckets.get(name) ?? []).join("\n");
    credits.push({
      strand: name,
      marks,
      criterion: examples.split("\n")[0] || name,
      examples,
      awardNote: noteUsed ? "" : awardNote,
    });
    noteUsed = true;
  }
  return credits;
}

function skipSchemeChrome(line: string): boolean {
  if (
    /^(?:Question|Number|Answer|Mark|Indicative content)(?:\s+(?:Question|Number|Answer|Mark|Indicative content))*$/i.test(
      line,
    )
  )
    return true;
  if (/^Quantitative skills assessed:?$/i.test(line)) return true;
  if (/^QS\s*\d+\b/i.test(line)) return true;
  if (/^Knowledge\s+\d+\s*,\s*Application/i.test(line)) return true;
  if (/^\(\d{1,2}\)$/.test(line)) return true;
  if (RANGE.test(line) && /^Level\b/i.test(line)) return true;
  return false;
}

export function schemeLines(items: PdfItem[]): string[] {
  return textLines(items);
}
