/** Typed tables. drizzle/0001_paper_bank.sql owns triggers and checks. */
import {
  boolean,
  customType,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType: () => "bytea",
});

export const specifications = pgTable("specifications", {
  id: uuid().primaryKey(),
  board: text().notNull(),
  qualification: text().notNull(),
  code: text().notNull(),
  subject: text().notNull(),
});

export const components = pgTable("components", {
  id: uuid().primaryKey(),
  specificationId: uuid("specification_id").notNull(),
  code: text().notNull(),
  title: text().notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  totalMarks: integer("total_marks").notNull(),
  themes: text().array().notNull(),
});

export const series = pgTable("series", {
  id: uuid().primaryKey(),
  name: text().notNull(),
});

export const papers = pgTable("papers", {
  id: uuid().primaryKey(),
  componentId: uuid("component_id").notNull(),
  seriesId: uuid("series_id").notNull(),
  examDate: date("exam_date"),
  instructions: text().notNull(),
  permissionConfirmed: boolean("permission_confirmed").notNull(),
  status: text().notNull(),
  parserVersion: text("parser_version").notNull(),
});

export const sourceFiles = pgTable("source_files", {
  id: uuid().primaryKey(),
  paperId: uuid("paper_id").notNull(),
  role: text().notNull(),
  filename: text().notNull(),
  sha256: text().notNull(),
  pageCount: integer("page_count").notNull(),
  localPath: text("local_path").notNull(),
  pearsonCode: text("pearson_code"),
  schemeDate: date("scheme_date"),
  pdf: bytea("pdf"),
});

export const pages = pgTable("pages", {
  id: uuid().primaryKey(),
  sourceFileId: uuid("source_file_id").notNull(),
  pageNumber: integer("page_number").notNull(),
  text: text().notNull(),
  hasFigure: boolean("has_figure").notNull(),
});

export const sections = pgTable("sections", {
  id: uuid().primaryKey(),
  paperId: uuid("paper_id").notNull(),
  label: text().notNull(),
  marks: integer().notNull(),
  instruction: text().notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const extracts = pgTable("extracts", {
  id: uuid().primaryKey(),
  sectionId: uuid("section_id").notNull(),
  label: text().notNull(),
  body: text().notNull(),
  pageStart: integer("page_start").notNull(),
  pageEnd: integer("page_end").notNull(),
  needsFigure: boolean("needs_figure").notNull(),
});

export const figures = pgTable("figures", {
  id: uuid().primaryKey(),
  extractId: uuid("extract_id").notNull(),
  pageNumber: integer("page_number").notNull(),
  mediaType: text("media_type").notNull(),
  width: integer().notNull(),
  height: integer().notNull(),
  sha256: text().notNull(),
  png: bytea("png").notNull(),
});

export const questions = pgTable("questions", {
  id: text().primaryKey(),
  paperId: uuid("paper_id").notNull(),
  sectionId: uuid("section_id").notNull(),
  parentNumber: integer("parent_number").notNull(),
  part: text().notNull(),
  responseFormat: text("response_format").notNull(),
});

export const questionRevisions = pgTable("question_revisions", {
  id: uuid().primaryKey(),
  questionId: text("question_id").notNull(),
  revision: integer().notNull(),
  stem: text().notNull(),
  commandWord: text("command_word").notNull(),
  marks: integer().notNull(),
  sourcePages: integer("source_pages").array().notNull(),
});

export const questionExtracts = pgTable(
  "question_extracts",
  {
    questionRevisionId: uuid("question_revision_id").notNull(),
    extractId: uuid("extract_id").notNull(),
    cited: boolean().notNull(),
  },
  (table) => [primaryKey({ columns: [table.questionRevisionId, table.extractId] })],
);

export const markSchemes = pgTable("mark_schemes", {
  id: uuid().primaryKey(),
  paperId: uuid("paper_id").notNull(),
  sourceFileId: uuid("source_file_id").notNull(),
  revisedOn: date("revised_on"),
  guidance: text().notNull(),
});

export const schemeItems = pgTable("scheme_items", {
  id: uuid().primaryKey(),
  markSchemeId: uuid("mark_scheme_id").notNull(),
  questionRevisionId: uuid("question_revision_id").notNull(),
  style: text().notNull(),
  aoKnowledge: integer("ao_knowledge").notNull(),
  aoApplication: integer("ao_application").notNull(),
  aoAnalysis: integer("ao_analysis").notNull(),
  aoEvaluation: integer("ao_evaluation").notNull(),
  quantitativeSkills: text("quantitative_skills").array().notNull(),
  sourceText: text("source_text").notNull(),
});

export const pointCredits = pgTable("point_credits", {
  id: uuid().primaryKey(),
  schemeItemId: uuid("scheme_item_id").notNull(),
  strand: text().notNull(),
  marks: integer().notNull(),
  criterion: text().notNull(),
  examples: text().notNull(),
  awardNote: text("award_note").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const indicativePoints = pgTable("indicative_points", {
  id: uuid().primaryKey(),
  schemeItemId: uuid("scheme_item_id").notNull(),
  role: text().notNull(),
  text: text().notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const levelBands = pgTable("level_bands", {
  id: uuid().primaryKey(),
  schemeItemId: uuid("scheme_item_id").notNull(),
  level: integer().notNull(),
  minMark: integer("min_mark").notNull(),
  maxMark: integer("max_mark").notNull(),
  descriptor: text().notNull(),
});

export const topics = pgTable("topics", {
  id: uuid().primaryKey(),
  specificationId: uuid("specification_id").notNull(),
  theme: text().notNull(),
  label: text().notNull(),
});

export const questionTopics = pgTable(
  "question_topics",
  {
    questionId: text("question_id").notNull(),
    topicId: uuid("topic_id").notNull(),
    confirmed: boolean().notNull(),
  },
  (table) => [primaryKey({ columns: [table.questionId, table.topicId] })],
);

export const reviews = pgTable("reviews", {
  id: uuid().primaryKey(),
  questionRevisionId: uuid("question_revision_id").notNull(),
  decision: text().notNull(),
  note: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const publications = pgTable("publications", {
  id: uuid().primaryKey(),
  paperId: uuid("paper_id").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  contentHash: text("content_hash").notNull(),
  snapshot: jsonb().notNull(),
});

export const importRuns = pgTable("import_runs", {
  id: uuid().primaryKey(),
  sha256: text().notNull(),
  parserVersion: text("parser_version").notNull(),
  issues: jsonb().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
