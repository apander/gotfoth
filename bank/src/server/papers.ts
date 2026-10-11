import "server-only";
import { createHash } from "node:crypto";
import { paperLabel } from "../lib/labels";
import { database, resetDatabase, transaction } from "./db";
import type { QuestionView } from "../lib/types";

type ExtractRow = {
  label: string;
  body: string;
  needs_figure: boolean;
  cited: boolean;
  figure_id: string | null;
  width: number | null;
  height: number | null;
  page_number: number | null;
};

function groupExtracts(rows: ExtractRow[]): QuestionView["extracts"] {
  const grouped: QuestionView["extracts"] = [];
  for (const row of rows) {
    let extract = grouped.find((item) => item.label === row.label);
    if (!extract) {
      extract = {
        label: row.label,
        text: row.body,
        needsFigure: row.needs_figure,
        cited: row.cited,
        figures: [],
      };
      grouped.push(extract);
    }
    if (row.figure_id && row.width && row.height && row.page_number)
      extract.figures.push({
        id: row.figure_id,
        width: row.width,
        height: row.height,
        page: row.page_number,
      });
  }
  return grouped;
}

export async function listPapers() {
  const result = await database().query(
    `SELECT p.id, p.status, p.exam_date::text AS exam_date, p.permission_confirmed, c.code, c.title,
            spec.subject, s.name AS series,
            (SELECT count(*) FROM questions q WHERE q.paper_id = p.id) AS questions,
            (SELECT count(*) FROM questions q
              JOIN question_revisions r ON r.question_id = q.id AND r.revision = 1
              WHERE q.paper_id = p.id
                AND (SELECT decision FROM reviews WHERE question_revision_id = r.id ORDER BY created_at DESC LIMIT 1) = 'accept'
            ) AS accepted,
            (SELECT issues FROM import_runs r
              JOIN source_files f ON f.sha256 = r.sha256 AND f.paper_id = p.id AND f.role = 'question_paper'
              WHERE r.parser_version = p.parser_version
              LIMIT 1) AS issues
     FROM papers p
     JOIN components c ON c.id = p.component_id
     JOIN specifications spec ON spec.id = c.specification_id
     JOIN series s ON s.id = p.series_id
     ORDER BY c.code`,
  );
  return result.rows as {
    id: string;
    status: string;
    exam_date: string | null;
    permission_confirmed: boolean;
    code: string;
    title: string;
    subject: string;
    series: string;
    questions: string;
    accepted: string;
    issues: string[] | null;
  }[];
}

export async function paperDetail(id: string) {
  const paper = await database().query(
    `SELECT p.id, p.status, p.exam_date::text AS exam_date, p.instructions, p.permission_confirmed, p.parser_version,
            c.code, c.title, s.name AS series, spec.subject,
            m.guidance, m.revised_on::text AS revised_on
     FROM papers p
     JOIN components c ON c.id = p.component_id
     JOIN series s ON s.id = p.series_id
     JOIN specifications spec ON spec.id = c.specification_id
     LEFT JOIN mark_schemes m ON m.paper_id = p.id
     WHERE p.id = $1`,
    [id],
  );
  if (!paper.rows[0]) return null;
  const questions = await database().query(
    `SELECT q.id, q.parent_number, q.part, q.response_format, sec.label AS section,
            r.id AS revision_id, r.stem, r.command_word, r.marks,
            (SELECT decision FROM reviews WHERE question_revision_id = r.id ORDER BY created_at DESC LIMIT 1) AS decision
     FROM questions q
     JOIN sections sec ON sec.id = q.section_id
     JOIN question_revisions r ON r.question_id = q.id AND r.revision = 1
     WHERE q.paper_id = $1
     ORDER BY sec.sort_order, q.parent_number, q.part`,
    [id],
  );
  const issues = await database().query(
    `SELECT DISTINCT r.issues
     FROM import_runs r
     JOIN source_files f ON f.sha256 = r.sha256
     JOIN papers p ON p.id = f.paper_id
     WHERE f.paper_id = $1 AND r.parser_version = p.parser_version`,
    [id],
  );
  return {
    paper: paper.rows[0] as {
      id: string;
      status: string;
      exam_date: string | null;
      instructions: string;
      permission_confirmed: boolean;
      code: string;
      title: string;
      series: string;
      subject: string;
      guidance: string | null;
      revised_on: string | null;
    },
    questions: questions.rows as {
      id: string;
      parent_number: number;
      part: string;
      response_format: string;
      section: string;
      revision_id: string;
      stem: string;
      command_word: string;
      marks: number;
      decision: string | null;
    }[],
    issues: (issues.rows as { issues: string[] }[]).flatMap((row) => row.issues ?? []),
  };
}

export async function questionDetail(questionId: string) {
  const result = await database().query(
    `SELECT q.id, q.paper_id, q.response_format, sec.label AS section,
            r.id AS revision_id, r.stem, r.command_word, r.marks, r.source_pages,
            si.style, si.ao_knowledge, si.ao_application, si.ao_analysis, si.ao_evaluation,
            si.quantitative_skills, si.source_text, si.id AS scheme_item_id,
            c.code, c.title, spec.subject, s.name AS series, p.exam_date::text AS exam_date,
            q.parent_number, q.part
     FROM questions q
     JOIN sections sec ON sec.id = q.section_id
     JOIN papers p ON p.id = q.paper_id
     JOIN components c ON c.id = p.component_id
     JOIN specifications spec ON spec.id = c.specification_id
     JOIN series s ON s.id = p.series_id
     JOIN question_revisions r ON r.question_id = q.id AND r.revision = 1
     LEFT JOIN scheme_items si ON si.question_revision_id = r.id
     WHERE q.id = $1`,
    [questionId],
  );
  const question = result.rows[0] as
    | {
        id: string;
        paper_id: string;
        response_format: string;
        section: string;
        revision_id: string;
        stem: string;
        command_word: string;
        marks: number;
        source_pages: number[];
        style: string | null;
        ao_knowledge: number | null;
        ao_application: number | null;
        ao_analysis: number | null;
        ao_evaluation: number | null;
        quantitative_skills: string[] | null;
        source_text: string | null;
        scheme_item_id: string | null;
        code: string;
        title: string;
        subject: string;
        series: string;
        exam_date: string | null;
        parent_number: number;
        part: string;
      }
    | undefined;
  if (!question) return null;
  const extracts = await database().query(
    `SELECT e.label, e.body, e.needs_figure, qe.cited,
            f.id AS figure_id, f.width, f.height, f.page_number
     FROM question_extracts qe
     JOIN extracts e ON e.id = qe.extract_id
     LEFT JOIN figures f ON f.extract_id = e.id
     WHERE qe.question_revision_id = $1
     ORDER BY e.label, f.page_number`,
    [question.revision_id],
  );
  const pages = await database().query(
    `SELECT pg.page_number, pg.text
     FROM pages pg
     JOIN source_files f ON f.id = pg.source_file_id
     WHERE f.paper_id = $1 AND f.role = 'question_paper' AND pg.page_number = ANY($2::int[])
     ORDER BY pg.page_number`,
    [question.paper_id, question.source_pages],
  );
  const credits = await database().query(
    `SELECT strand, marks, criterion, examples, award_note FROM point_credits
     WHERE scheme_item_id = $1 ORDER BY sort_order`,
    [question.scheme_item_id],
  );
  const indicative = await database().query(
    `SELECT role, text FROM indicative_points WHERE scheme_item_id = $1 ORDER BY sort_order`,
    [question.scheme_item_id],
  );
  const bands = await database().query(
    `SELECT level, min_mark, max_mark, descriptor FROM level_bands
     WHERE scheme_item_id = $1 ORDER BY level`,
    [question.scheme_item_id],
  );
  const topics = await database().query(
    `SELECT t.id, t.theme, t.label FROM topics t
     JOIN components c ON c.specification_id = t.specification_id
     JOIN papers p ON p.component_id = c.id
     WHERE p.id = $1 ORDER BY t.theme`,
    [question.paper_id],
  );
  const linked = await database().query(
    `SELECT t.id, t.theme, t.label FROM question_topics qt
     JOIN topics t ON t.id = qt.topic_id
     WHERE qt.question_id = $1 AND qt.confirmed
     ORDER BY t.theme`,
    [questionId],
  );
  const review = await database().query(
    `SELECT decision, note FROM reviews WHERE question_revision_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [question.revision_id],
  );
  return {
    question,
    extracts: groupExtracts(extracts.rows as ExtractRow[]),
    pages: pages.rows as { page_number: number; text: string }[],
    credits: credits.rows as {
      strand: string;
      marks: number;
      criterion: string;
      examples: string;
      award_note: string;
    }[],
    indicative: indicative.rows as { role: string; text: string }[],
    bands: bands.rows as { level: number; min_mark: number; max_mark: number; descriptor: string }[],
    topics: topics.rows as { id: string; theme: string; label: string }[],
    linked: linked.rows as { id: string; theme: string; label: string }[],
    review: (review.rows[0] as { decision: string; note: string } | undefined) ?? null,
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export async function publishPaper(paperId: string) {
  return transaction(async (client) => {
    const paper = await client.query(
      `SELECT p.id, p.permission_confirmed, p.status, p.exam_date::text AS exam_date,
              c.code, s.name AS series, spec.subject
       FROM papers p
       JOIN components c ON c.id = p.component_id
       JOIN series s ON s.id = p.series_id
       JOIN specifications spec ON spec.id = c.specification_id
       WHERE p.id = $1
       FOR UPDATE`,
      [paperId],
    );
    const row = paper.rows[0] as
      | {
          id: string;
          permission_confirmed: boolean;
          status: string;
          exam_date: string | null;
          code: string;
          series: string;
          subject: string;
        }
      | undefined;
    if (!row) throw new Error("Paper not found.");
    if (!row.permission_confirmed)
      throw new Error("Confirm permission to store this paper before publishing.");
    const questions = await client.query(
      `SELECT q.id, sec.label AS section, r.id AS revision_id, r.stem, r.command_word, r.marks, q.response_format,
              si.style, si.ao_knowledge, si.ao_application, si.ao_analysis, si.ao_evaluation, si.quantitative_skills,
              (SELECT decision FROM reviews WHERE question_revision_id = r.id ORDER BY created_at DESC LIMIT 1) AS decision
       FROM questions q
       JOIN sections sec ON sec.id = q.section_id
       JOIN question_revisions r ON r.question_id = q.id AND r.revision = 1
       JOIN scheme_items si ON si.question_revision_id = r.id
       WHERE q.paper_id = $1
       ORDER BY q.id`,
      [paperId],
    );
    if (questions.rows.length === 0) throw new Error("This paper has no questions.");
    if (questions.rows.some((item) => item.decision !== "accept"))
      throw new Error("Accept every part before publishing.");
    const issues = await client.query(
      `SELECT r.issues FROM import_runs r
       JOIN source_files f ON f.sha256 = r.sha256 AND f.role = 'question_paper'
       JOIN papers p ON p.id = f.paper_id AND r.parser_version = p.parser_version
       WHERE f.paper_id = $1`,
      [paperId],
    );
    const blocking = (issues.rows[0]?.issues as string[] | undefined) ?? [];
    if (blocking.length) throw new Error(blocking[0]);

    const views: QuestionView[] = [];
    for (const item of questions.rows) {
      const extracts = await client.query(
        `SELECT e.label, e.body, e.needs_figure, qe.cited,
                f.id AS figure_id, f.width, f.height, f.page_number
         FROM question_extracts qe
         JOIN extracts e ON e.id = qe.extract_id
         LEFT JOIN figures f ON f.extract_id = e.id
         WHERE qe.question_revision_id = $1
         ORDER BY e.label, f.page_number`,
        [item.revision_id],
      );
      const objectives = {
        knowledge: item.ao_knowledge as number,
        application: item.ao_application as number,
        analysis: item.ao_analysis as number,
        evaluation: item.ao_evaluation as number,
      };
      const base = {
        id: item.id as string,
        publicationId: "",
        paper: paperLabel({
          examDate: row.exam_date,
          series: row.series,
          subject: row.subject,
          code: row.code,
        }),
        series: row.series as string,
        section: item.section as string,
        stem: item.stem as string,
        marks: item.marks as number,
        command: item.command_word as string,
        responseFormat: item.response_format,
        extracts: groupExtracts(extracts.rows as ExtractRow[]),
      };
      if (item.style === "points") {
        const credits = await client.query(
          `SELECT strand, marks, criterion, examples, award_note FROM point_credits
           WHERE scheme_item_id = (SELECT id FROM scheme_items WHERE question_revision_id = $1)
           ORDER BY sort_order`,
          [item.revision_id],
        );
        views.push({
          ...base,
          scheme: {
            style: "points",
            objectives,
            quantitativeSkills: item.quantitative_skills ?? [],
            pointCredits: credits.rows.map((credit) => ({
              strand: credit.strand,
              marks: credit.marks,
              criterion: credit.criterion,
              examples: credit.examples,
              awardNote: credit.award_note,
            })),
          },
        });
      } else {
        const points = await client.query(
          `SELECT role, text FROM indicative_points
           WHERE scheme_item_id = (SELECT id FROM scheme_items WHERE question_revision_id = $1)
           ORDER BY sort_order`,
          [item.revision_id],
        );
        const bands = await client.query(
          `SELECT level, min_mark, max_mark, descriptor FROM level_bands
           WHERE scheme_item_id = (SELECT id FROM scheme_items WHERE question_revision_id = $1)
           ORDER BY level`,
          [item.revision_id],
        );
        views.push({
          ...base,
          scheme: {
            style: "levels",
            objectives,
            quantitativeSkills: item.quantitative_skills ?? [],
            indicativePoints: points.rows.map((point) => ({ role: point.role, text: point.text })),
            levelBands: bands.rows.map((band) => ({
              level: band.level,
              min: band.min_mark,
              max: band.max_mark,
              descriptor: band.descriptor,
            })),
          },
        });
      }
    }
    const snapshot = { questions: views.map(({ publicationId: _ignored, ...view }) => view) };
    const contentHash = createHash("sha256").update(JSON.stringify(canonical(snapshot))).digest("hex");
    const saved = await client.query(
      `INSERT INTO publications (id, paper_id, content_hash, snapshot)
       VALUES (gen_random_uuid(), $1, $2, $3::jsonb)
       ON CONFLICT (paper_id, content_hash) DO UPDATE SET content_hash = EXCLUDED.content_hash
       RETURNING id`,
      [paperId, contentHash, JSON.stringify(snapshot)],
    );
    const publicationId = saved.rows[0].id as string;
    const published = {
      questions: views.map((view) => ({ ...view, publicationId })),
    };
    await client.query("UPDATE publications SET snapshot = $2::jsonb WHERE id = $1", [
      publicationId,
      JSON.stringify(published),
    ]);
    await client.query("UPDATE papers SET status = 'published' WHERE id = $1", [paperId]);
    return publicationId;
  });
}

export async function figureFile(id: string, publishedOnly: boolean) {
  const read = () =>
    database().query(
      `SELECT f.png, f.media_type
       FROM figures f
       JOIN extracts e ON e.id = f.extract_id
       JOIN sections s ON s.id = e.section_id
       JOIN papers p ON p.id = s.paper_id
       WHERE f.id = $1 AND ($2::boolean = false OR p.status = 'published')`,
      [id, publishedOnly],
    );
  try {
    const result = await read();
    return (result.rows[0] as { png: Buffer; media_type: string } | undefined) ?? null;
  } catch (error) {
    const reset = error instanceof Error && "code" in error && error.code === "ECONNRESET";
    if (!reset) throw error;
    resetDatabase();
    const result = await read();
    return (result.rows[0] as { png: Buffer; media_type: string } | undefined) ?? null;
  }
}

export async function publishedQuestion(questionId: string): Promise<QuestionView | null> {
  const result = await database().query(
    `SELECT snapshot FROM publications
     WHERE EXISTS (
       SELECT 1 FROM jsonb_array_elements(snapshot -> 'questions') AS item
       WHERE item ->> 'id' = $1
     )
     ORDER BY published_at DESC
     LIMIT 1`,
    [questionId],
  );
  const row = result.rows[0] as { snapshot: { questions: QuestionView[] } } | undefined;
  return row?.snapshot.questions.find((question) => question.id === questionId) ?? null;
}
