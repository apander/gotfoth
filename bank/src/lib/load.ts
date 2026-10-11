import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { QueryResult, QueryResultRow } from "pg";
import { stableId } from "./lines";
import { COMPONENT_IDS, PARSER_VERSION, SERIES_ID, type ParsedPaper } from "./types";

type Sql = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ) => Promise<QueryResult<T>>;
};

export async function loadPaper(client: Sql, paper: ParsedPaper, reload: boolean) {
  const componentId = COMPONENT_IDS[paper.component];
  if (!componentId) throw new Error(`Unknown component ${paper.component}.`);
  const existing = await client.query(
    "SELECT id, status FROM papers WHERE component_id = $1 AND series_id = $2",
    [componentId, SERIES_ID],
  );
  const row = existing.rows[0] as { id: string; status: string } | undefined;
  if (row?.status === "published")
    throw new Error(`9BS0/${paper.component} is already published and was left unchanged.`);
  if (row && !reload) {
    const same = await client.query(
      `SELECT 1 FROM import_runs WHERE sha256 = $1 AND parser_version = $2
       AND EXISTS (SELECT 1 FROM import_runs WHERE sha256 = $3 AND parser_version = $2)`,
      [paper.questionFile.sha256, PARSER_VERSION, paper.schemeFile.sha256],
    );
    if (same.rowCount) return { skipped: true, paperId: row.id };
  }
  if (row) await client.query("DELETE FROM papers WHERE id = $1", [row.id]);

  const paperId = randomUUID();
  await client.query(
    `INSERT INTO papers (id, component_id, series_id, exam_date, instructions, permission_confirmed, status, parser_version)
     VALUES ($1, $2, $3, $4, $5, false, 'draft', $6)`,
    [paperId, componentId, SERIES_ID, paper.examDate, paper.instructions, PARSER_VERSION],
  );

  const questionFileId = randomUUID();
  const bookletFileId = randomUUID();
  const schemeFileId = randomUUID();
  const questionPdf = await readFile(paper.questionFile.path);
  const schemePdf = await readFile(paper.schemeFile.path);
  await client.query(
    `INSERT INTO source_files (id, paper_id, role, filename, sha256, page_count, local_path, pearson_code, pdf)
     VALUES ($1, $2, 'question_paper', $3, $4, $5, $6, $7, $8),
            ($9, $2, 'source_booklet', $3, $4, $5, $6, $7, $8)`,
    [
      questionFileId,
      paperId,
      paper.questionFile.filename,
      paper.questionFile.sha256,
      paper.questionFile.pageCount,
      paper.questionFile.path,
      paper.pearsonCode,
      questionPdf,
      bookletFileId,
    ],
  );
  await client.query(
    `INSERT INTO source_files (id, paper_id, role, filename, sha256, page_count, local_path, pearson_code, scheme_date, pdf)
     VALUES ($1, $2, 'mark_scheme', $3, $4, $5, $6, $7, $8, $9)`,
    [
      schemeFileId,
      paperId,
      paper.schemeFile.filename,
      paper.schemeFile.sha256,
      paper.schemeFile.pageCount,
      paper.schemeFile.path,
      paper.pearsonCode,
      paper.schemeDate,
      schemePdf,
    ],
  );

  for (const page of paper.pages) {
    const sourceId =
      page.role === "mark_scheme"
        ? schemeFileId
        : page.role === "source_booklet"
          ? bookletFileId
          : questionFileId;
    await client.query(
      `INSERT INTO pages (id, source_file_id, page_number, text, has_figure) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), sourceId, page.page, page.text, page.hasFigure],
    );
  }

  const sectionIds = new Map<string, string>();
  for (const [index, section] of paper.sections.entries()) {
    const id = randomUUID();
    sectionIds.set(section.label, id);
    await client.query(
      `INSERT INTO sections (id, paper_id, label, marks, instruction, sort_order) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, paperId, section.label, section.marks, section.instruction, index + 1],
    );
  }

  const extractIds = new Map<string, string>();
  for (const extract of paper.extracts) {
    const id = randomUUID();
    extractIds.set(`${extract.section}${extract.label}`, id);
    await client.query(
      `INSERT INTO extracts (id, section_id, label, body, page_start, page_end, needs_figure)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        sectionIds.get(extract.section),
        extract.label,
        extract.text,
        extract.pageStart,
        extract.pageEnd,
        extract.figures.length > 0,
      ],
    );
    for (const figure of extract.figures) {
      if (figure.png.length === 0) throw new Error(`Extract ${extract.label} graphic was not rendered.`);
      await client.query(
        `INSERT INTO figures (id, extract_id, page_number, media_type, width, height, sha256, png)
         VALUES ($1, $2, $3, 'image/png', $4, $5, $6, $7)`,
        [
          randomUUID(),
          id,
          figure.page,
          figure.pixelWidth,
          figure.pixelHeight,
          createHash("sha256").update(figure.png).digest("hex"),
          figure.png,
        ],
      );
    }
  }

  const schemeId = randomUUID();
  await client.query(
    `INSERT INTO mark_schemes (id, paper_id, source_file_id, revised_on, guidance) VALUES ($1, $2, $3, $4, $5)`,
    [schemeId, paperId, schemeFileId, paper.schemeDate, paper.guidance],
  );

  for (const question of paper.questions) {
    const questionId = stableId(paper.component, question.parent, question.part);
    const revisionId = randomUUID();
    await client.query(
      `INSERT INTO questions (id, paper_id, section_id, parent_number, part, response_format)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        questionId,
        paperId,
        sectionIds.get(question.section),
        question.parent,
        question.part,
        question.format,
      ],
    );
    await client.query(
      `INSERT INTO question_revisions (id, question_id, revision, stem, command_word, marks, source_pages)
       VALUES ($1, $2, 1, $3, $4, $5, $6)`,
      [revisionId, questionId, question.stem, question.command, question.marks, question.pages],
    );
    for (const extract of paper.extracts.filter((item) => item.section === question.section)) {
      await client.query(
        `INSERT INTO question_extracts (question_revision_id, extract_id, cited) VALUES ($1, $2, $3)`,
        [revisionId, extractIds.get(`${extract.section}${extract.label}`), question.citedExtracts.includes(extract.label)],
      );
    }
    const scheme = question.scheme;
    if (!scheme) continue;
    const itemId = randomUUID();
    await client.query(
      `INSERT INTO scheme_items (
         id, mark_scheme_id, question_revision_id, style,
         ao_knowledge, ao_application, ao_analysis, ao_evaluation, quantitative_skills, source_text
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        itemId,
        schemeId,
        revisionId,
        scheme.style,
        scheme.knowledge,
        scheme.application,
        scheme.analysis,
        scheme.evaluation,
        scheme.quantitativeSkills,
        scheme.sourceText,
      ],
    );
    for (const [index, credit] of scheme.credits.entries()) {
      await client.query(
        `INSERT INTO point_credits (id, scheme_item_id, strand, marks, criterion, examples, award_note, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [randomUUID(), itemId, credit.strand, credit.marks, credit.criterion, credit.examples, credit.awardNote, index + 1],
      );
    }
    for (const [index, point] of scheme.indicative.entries()) {
      await client.query(
        `INSERT INTO indicative_points (id, scheme_item_id, role, text, sort_order) VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), itemId, point.role, point.text, index + 1],
      );
    }
    for (const band of scheme.bands) {
      await client.query(
        `INSERT INTO level_bands (id, scheme_item_id, level, min_mark, max_mark, descriptor)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), itemId, band.level, band.min, band.max, band.descriptor],
      );
    }
  }

  for (const file of [paper.questionFile, paper.schemeFile]) {
    await client.query(
      `INSERT INTO import_runs (id, sha256, parser_version, issues)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (sha256, parser_version)
       DO UPDATE SET issues = EXCLUDED.issues, created_at = now()`,
      [randomUUID(), file.sha256, PARSER_VERSION, JSON.stringify(paper.issues)],
    );
  }
  return { skipped: false, paperId };
}
