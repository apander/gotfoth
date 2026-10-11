import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { AppError, requireThat } from "../lib/errors";
import { accountIsSuperuser, database, type Actor } from "./db";

type Sql = Pick<PoolClient, "query">;

function paperLabel(input: {
  examDate: string | null;
  series: string;
  subject: string;
  code: string;
}) {
  const year = input.examDate?.slice(0, 4) || input.series.match(/\d{4}/)?.[0] || input.series;
  return `${year} ${input.subject} Paper ${Number(input.code)}`;
}

async function requireTeacher(actor: Actor) {
  if (await accountIsSuperuser(actor)) return;
  const found = await database().query(
    "SELECT 1 FROM memberships WHERE user_id=$1 AND role='teacher' AND active LIMIT 1",
    [actor.id],
  );
  requireThat(found.rowCount, "FORBIDDEN", "Teacher access required.", 403);
}

async function withPapers<T>(actor: Actor, fn: (client: Sql) => Promise<T>) {
  await requireTeacher(actor);
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL search_path TO paper_bank, public");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function groupExtracts(
  rows: {
    label: string;
    body: string;
    needs_figure: boolean;
    cited: boolean;
    figure_id: string | null;
    width: number | null;
    height: number | null;
    page_number: number | null;
  }[],
) {
  const grouped: {
    label: string;
    text: string;
    cited: boolean;
    figures: { id: string; width: number; height: number; page: number }[];
  }[] = [];
  for (const row of rows) {
    let extract = grouped.find((item) => item.label === row.label);
    if (!extract) {
      extract = { label: row.label, text: row.body, cited: row.cited, figures: [] };
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

export async function listExamPapers(actor: Actor) {
  return withPapers(actor, async (client) => {
    const result = await client.query(
      `SELECT p.id, p.status, p.exam_date::text AS exam_date, p.permission_confirmed,
              c.code, c.title, spec.subject, s.name AS series,
              (SELECT count(*) FROM questions q WHERE q.paper_id = p.id) AS questions,
              (SELECT count(*) FROM questions q
                JOIN question_revisions r ON r.question_id = q.id AND r.revision = 1
                WHERE q.paper_id = p.id
                  AND (SELECT decision FROM reviews WHERE question_revision_id = r.id ORDER BY created_at DESC LIMIT 1) = 'accept'
              ) AS accepted
       FROM papers p
       JOIN components c ON c.id = p.component_id
       JOIN specifications spec ON spec.id = c.specification_id
       JOIN series s ON s.id = p.series_id
       ORDER BY c.code`,
    );
    return result.rows.map((row) => ({
      ...row,
      label: paperLabel({
        examDate: row.exam_date,
        series: row.series,
        subject: row.subject,
        code: row.code,
      }),
    }));
  });
}

export async function examPaper(actor: Actor, paperId: string) {
  return withPapers(actor, async (client) => {
    const paper = await client.query(
      `SELECT p.id, p.status, p.exam_date::text AS exam_date, p.instructions, p.permission_confirmed,
              c.code, c.title, s.name AS series, spec.subject, m.guidance, m.revised_on::text AS revised_on
       FROM papers p
       JOIN components c ON c.id = p.component_id
       JOIN series s ON s.id = p.series_id
       JOIN specifications spec ON spec.id = c.specification_id
       LEFT JOIN mark_schemes m ON m.paper_id = p.id
       WHERE p.id = $1`,
      [paperId],
    );
    if (!paper.rows[0]) throw new AppError("NOT_FOUND", "This paper is unavailable.", 404);
    const questions = await client.query(
      `SELECT q.id, q.parent_number, q.part, q.response_format, sec.label AS section,
              r.stem, r.command_word, r.marks,
              (SELECT decision FROM reviews WHERE question_revision_id = r.id ORDER BY created_at DESC LIMIT 1) AS decision
       FROM questions q
       JOIN sections sec ON sec.id = q.section_id
       JOIN question_revisions r ON r.question_id = q.id AND r.revision = 1
       WHERE q.paper_id = $1
       ORDER BY sec.sort_order, q.parent_number, q.part`,
      [paperId],
    );
    const row = paper.rows[0];
    return {
      paper: {
        ...row,
        label: paperLabel({
          examDate: row.exam_date,
          series: row.series,
          subject: row.subject,
          code: row.code,
        }),
      },
      questions: questions.rows,
    };
  });
}

export async function examQuestion(actor: Actor, questionId: string) {
  return withPapers(actor, async (client) => {
    const result = await client.query(
      `SELECT q.id, q.paper_id, q.response_format, sec.label AS section,
              r.id AS revision_id, r.stem, r.command_word, r.marks,
              c.code, spec.subject, s.name AS series, p.exam_date::text AS exam_date,
              q.parent_number, q.part, si.source_text
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
    const question = result.rows[0];
    if (!question) throw new AppError("NOT_FOUND", "This question is unavailable.", 404);
    const extracts = await client.query(
      `SELECT e.label, e.body, e.needs_figure, qe.cited,
              f.id AS figure_id, f.width, f.height, f.page_number
       FROM question_extracts qe
       JOIN extracts e ON e.id = qe.extract_id
       LEFT JOIN figures f ON f.extract_id = e.id
       WHERE qe.question_revision_id = $1
       ORDER BY e.label, f.page_number`,
      [question.revision_id],
    );
    const topics = await client.query(
      `SELECT t.id, t.theme, t.label FROM topics t
       JOIN components c ON c.specification_id = t.specification_id
       JOIN papers p ON p.component_id = c.id
       WHERE p.id = $1 ORDER BY t.theme`,
      [question.paper_id],
    );
    const linked = await client.query(
      `SELECT topic_id FROM question_topics WHERE question_id=$1 AND confirmed`,
      [questionId],
    );
    const review = await client.query(
      `SELECT decision, note FROM reviews WHERE question_revision_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [question.revision_id],
    );
    return {
      question: {
        ...question,
        label: paperLabel({
          examDate: question.exam_date,
          series: question.series,
          subject: question.subject,
          code: question.code,
        }),
      },
      extracts: groupExtracts(extracts.rows),
      topics: topics.rows,
      linkedTopicIds: linked.rows.map((row) => row.topic_id),
      review: review.rows[0] ?? null,
    };
  });
}

export async function reviewExamQuestion(
  actor: Actor,
  input: { revisionId: string; decision: "accept" | "reject"; note: string; paperId: string },
) {
  return withPapers(actor, async (client) => {
    await client.query(
      "INSERT INTO reviews (id, question_revision_id, decision, note) VALUES (gen_random_uuid(), $1, $2, $3)",
      [input.revisionId, input.decision, input.note.slice(0, 2000)],
    );
    await client.query(
      `UPDATE papers p SET status = CASE
         WHEN p.status = 'published' THEN 'published'
         WHEN (SELECT count(*) FROM questions WHERE paper_id = p.id) > 0
          AND (SELECT count(*) FROM questions q
               JOIN question_revisions r ON r.question_id = q.id AND r.revision = 1
               WHERE q.paper_id = p.id
                 AND (SELECT decision FROM reviews WHERE question_revision_id = r.id ORDER BY created_at DESC LIMIT 1) = 'accept'
              ) = (SELECT count(*) FROM questions WHERE paper_id = p.id)
         THEN 'reviewed' ELSE 'draft' END
       WHERE p.id = $1`,
      [input.paperId],
    );
    return { ok: true };
  });
}

export async function setExamTopic(
  actor: Actor,
  input: { questionId: string; topicId: string; confirmed: boolean },
) {
  return withPapers(actor, async (client) => {
    if (input.confirmed)
      await client.query(
        `INSERT INTO question_topics (question_id, topic_id, confirmed) VALUES ($1, $2, true)
         ON CONFLICT (question_id, topic_id) DO UPDATE SET confirmed = true`,
        [input.questionId, input.topicId],
      );
    else
      await client.query(
        "DELETE FROM question_topics WHERE question_id=$1 AND topic_id=$2",
        [input.questionId, input.topicId],
      );
    return { ok: true };
  });
}

export async function setExamPermission(actor: Actor, paperId: string, confirmed: boolean) {
  return withPapers(actor, async (client) => {
    const updated = await client.query(
      "UPDATE papers SET permission_confirmed=$2 WHERE id=$1 RETURNING id",
      [paperId, confirmed],
    );
    if (!updated.rowCount) throw new AppError("NOT_FOUND", "This paper is unavailable.", 404);
    return { ok: true };
  });
}

export async function publishExamPaper(actor: Actor, paperId: string) {
  return withPapers(actor, async (client) => {
    const paper = await client.query(
      `SELECT p.id, p.permission_confirmed, p.exam_date::text AS exam_date, c.code, s.name AS series, spec.subject
       FROM papers p
       JOIN components c ON c.id = p.component_id
       JOIN series s ON s.id = p.series_id
       JOIN specifications spec ON spec.id = c.specification_id
       WHERE p.id = $1 FOR UPDATE`,
      [paperId],
    );
    const row = paper.rows[0];
    if (!row) throw new AppError("NOT_FOUND", "This paper is unavailable.", 404);
    requireThat(row.permission_confirmed, "PERMISSION", "Confirm permission to store this paper before publishing.");
    const questions = await client.query(
      `SELECT q.id, sec.label AS section, r.id AS revision_id, r.stem, r.command_word, r.marks, q.response_format,
              si.style, si.ao_knowledge, si.ao_application, si.ao_analysis, si.ao_evaluation, si.quantitative_skills,
              (SELECT decision FROM reviews WHERE question_revision_id = r.id ORDER BY created_at DESC LIMIT 1) AS decision
       FROM questions q
       JOIN sections sec ON sec.id = q.section_id
       JOIN question_revisions r ON r.question_id = q.id AND r.revision = 1
       JOIN scheme_items si ON si.question_revision_id = r.id
       WHERE q.paper_id = $1`,
      [paperId],
    );
    requireThat(questions.rows.length > 0, "EMPTY", "This paper has no questions.");
    requireThat(
      questions.rows.every((item) => item.decision === "accept"),
      "REVIEW",
      "Accept every part before publishing.",
    );
    const questionsView = [];
    for (const item of questions.rows) {
      const extracts = await client.query(
        `SELECT e.label, e.body, e.needs_figure, qe.cited, f.id AS figure_id, f.width, f.height, f.page_number
         FROM question_extracts qe
         JOIN extracts e ON e.id = qe.extract_id
         LEFT JOIN figures f ON f.extract_id = e.id
         WHERE qe.question_revision_id = $1
         ORDER BY e.label, f.page_number`,
        [item.revision_id],
      );
      questionsView.push({
        id: item.id,
        paper: paperLabel({
          examDate: row.exam_date,
          series: row.series,
          subject: row.subject,
          code: row.code,
        }),
        section: item.section,
        stem: item.stem,
        marks: item.marks,
        command: item.command_word,
        responseFormat: item.response_format,
        extracts: groupExtracts(extracts.rows),
        scheme: {
          style: item.style,
          objectives: {
            knowledge: item.ao_knowledge,
            application: item.ao_application,
            analysis: item.ao_analysis,
            evaluation: item.ao_evaluation,
          },
          quantitativeSkills: item.quantitative_skills ?? [],
        },
      });
    }
    const snapshot = { questions: questionsView };
    const contentHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
    await client.query(
      `INSERT INTO publications (id, paper_id, content_hash, snapshot)
       VALUES (gen_random_uuid(), $1, $2, $3::jsonb)
       ON CONFLICT (paper_id, content_hash) DO UPDATE SET snapshot = EXCLUDED.snapshot`,
      [paperId, contentHash, JSON.stringify(snapshot)],
    );
    await client.query("UPDATE papers SET status='published' WHERE id=$1", [paperId]);
    return { ok: true };
  });
}

export async function examFigure(actor: Actor, figureId: string) {
  await requireTeacher(actor);
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL search_path TO paper_bank, public");
    const result = await client.query(
      "SELECT png, media_type FROM figures WHERE id=$1",
      [figureId],
    );
    await client.query("COMMIT");
    const row = result.rows[0] as { png: Buffer; media_type: string } | undefined;
    if (!row) throw new AppError("NOT_FOUND", "This figure is unavailable.", 404);
    return row;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
