export const PARSER_VERSION = "10";
export const SPECIFICATION_ID = "00000000-0000-4000-8000-0000000009b0";
export const SERIES_ID = "00000000-0000-4000-8000-000000002025";
export const COMPONENT_IDS: Record<string, string> = {
  "01": "00000000-0000-4000-8000-000000000001",
  "02": "00000000-0000-4000-8000-000000000002",
  "03": "00000000-0000-4000-8000-000000000003",
};

export type ResponseFormat = "calculation" | "short" | "diagram" | "levels";
export type SchemeStyle = "points" | "levels";
export type CreditStrand = "knowledge" | "application" | "analysis" | "evaluation";
export type IndicativeRole =
  | "definition"
  | "application"
  | "counterbalance"
  | "judgement"
  | "note";

export type ParsedCredit = {
  strand: CreditStrand;
  marks: number;
  criterion: string;
  examples: string;
  awardNote: string;
};

export type ParsedIndicative = { role: IndicativeRole; text: string };
export type ParsedBand = {
  level: number;
  min: number;
  max: number;
  descriptor: string;
};

export type ParsedScheme = {
  style: SchemeStyle;
  knowledge: number;
  application: number;
  analysis: number;
  evaluation: number;
  quantitativeSkills: string[];
  sourceText: string;
  credits: ParsedCredit[];
  indicative: ParsedIndicative[];
  bands: ParsedBand[];
};

export type ParsedQuestion = {
  section: string;
  parent: number;
  part: string;
  stem: string;
  command: string;
  marks: number;
  format: ResponseFormat;
  pages: number[];
  citedExtracts: string[];
  scheme: ParsedScheme | null;
};

export type FigureClip = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  png: Buffer;
  pixelWidth: number;
  pixelHeight: number;
};

export type ParsedExtract = {
  section: string;
  label: string;
  text: string;
  pageStart: number;
  pageEnd: number;
  needsFigure: boolean;
  figures: FigureClip[];
};

export type ParsedPage = {
  role: "question_paper" | "source_booklet" | "mark_scheme";
  page: number;
  text: string;
  hasFigure: boolean;
};

export type SourceFile = {
  filename: string;
  path: string;
  sha256: string;
  pageCount: number;
};

export type ParsedPaper = {
  component: string;
  pearsonCode: string;
  title: string;
  examDate: string | null;
  durationMinutes: number;
  totalMarks: number;
  instructions: string;
  schemeDate: string | null;
  questionFile: SourceFile;
  schemeFile: SourceFile;
  bookletPage: number;
  sections: { label: string; marks: number; instruction: string }[];
  extracts: ParsedExtract[];
  questions: ParsedQuestion[];
  pages: ParsedPage[];
  guidance: string;
  issues: string[];
};

export type QuestionView = {
  id: string;
  publicationId: string;
  paper: string;
  series: string;
  section: string;
  stem: string;
  marks: number;
  command: string;
  responseFormat: ResponseFormat;
  extracts: {
    label: string;
    text: string;
    needsFigure: boolean;
    cited: boolean;
    figures: { id: string; width: number; height: number; page: number }[];
  }[];
  scheme:
    | {
        style: "points";
        objectives: {
          knowledge: number;
          application: number;
          analysis: number;
          evaluation: number;
        };
        quantitativeSkills: string[];
        pointCredits: ParsedCredit[];
      }
    | {
        style: "levels";
        objectives: {
          knowledge: number;
          application: number;
          analysis: number;
          evaluation: number;
        };
        quantitativeSkills: string[];
        indicativePoints: ParsedIndicative[];
        levelBands: ParsedBand[];
      };
};
