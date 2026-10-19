import { randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  type Actor,
  type Tx,
  family,
  learnerAccess,
  enqueue,
  audit,
} from "./db";
import { AppError, missing, requireThat } from "../lib/errors";
import { Paper, Enrolment, Mode, type Question } from "../lib/contracts";
import {
  chooseQuestions,
  selectedQuestions,
  studentQuestion,
  aggregateHistory,
  type HistoryEvidence,
} from "../lib/domain";
import { createQuote, reserve, release } from "./finance";
import { publishedPracticePapers } from "./exam-papers";
import { isTestFamily } from "../lib/test-accounts";
export async function catalogue(tx: Tx, familyId: string) {
  return (
    await tx.query(
      "SELECT data FROM catalogue WHERE status='published' AND (identity LIKE 'ux-fixture-%' OR identity LIKE 'ux-exam-example-%')=$1",
      [isTestFamily(familyId)],
    )
  ).rows.map((r) => Paper.parse(r.data));
}
export async function createAttempt(
  actor: Actor,
  familyId: string,
  input: unknown,
) {
  return family(actor, familyId, (tx) =>
    createAttemptInTransaction(tx, actor, familyId, input),
  );
}
export async function createAttemptInTransaction(
  tx: Tx,
  actor: Actor,
  familyId: string,
  input: unknown,
) {
  const data = z
    .object({
      learnerId: z.string().uuid(),
      enrolmentId: z.string().uuid(),
      mode: Mode,
      paperId: z.string().uuid().optional(),
      topic: z.string().optional(),
      retryOf: z.string().uuid().optional(),
    })
    .parse(input);
  const role = await learnerAccess(tx, actor, familyId, data.learnerId);
  requireThat(
    role === "student",
    "FORBIDDEN",
    "Students start their own practice.",
    403,
  );
  const row = (
    await tx.query(
      "SELECT data FROM enrolments WHERE id=$1 AND learner_id=$2",
      [data.enrolmentId, data.learnerId],
    )
  ).rows[0];
  if (!row) throw missing();
  const course = Enrolment.parse(row.data);
  const papers = (await catalogue(tx, familyId)).filter(
    (p) =>
      p.subject === course.subject &&
      p.compatibleSpecifications.includes(course.specification),
  );
  const seenRows = await tx.query(
    "SELECT question_id FROM exposure WHERE learner_id=$1 AND first_seen>now()-interval '14 days'",
    [data.learnerId],
  );
  const seen = new Set<string>(seenRows.rows.map((r) => r.question_id));
  const allSeen = new Set<string>(
    (
      await tx.query("SELECT question_id FROM exposure WHERE learner_id=$1", [
        data.learnerId,
      ])
    ).rows.map((r) => r.question_id),
  );
  const releases = (
    await tx.query(
      "SELECT paper_id FROM catalogue_releases WHERE family_id=$1",
      [familyId],
    )
  ).rows.map((r) => r.paper_id);
  const due = (
    await tx.query(
      "SELECT DISTINCT topic FROM corrective_tasks WHERE learner_id=$1 AND completed_at IS NULL AND due_at<=now()",
      [data.learnerId],
    )
  ).rows.map((r) => r.topic);
  let questions: Question[], sources: Paper[];
  if (data.retryOf) {
    const original = (
      await tx.query(
        "SELECT a.data,r.effective FROM assessments r JOIN submissions s ON s.id=r.submission_id JOIN attempts a ON a.id=s.attempt_id WHERE r.id=$1 AND r.learner_id=$2 AND r.state='published'",
        [data.retryOf, data.learnerId],
      )
    ).rows[0];
    if (!original) throw missing();
    requireThat(
      original.data.specification === course.specification &&
        original.data.subject === course.subject,
      "COURSE",
      "Choose the original course to practise this correction.",
    );
    const assessed = new Set(original.effective.map((r: any) => r.questionId));
    questions = original.data.questions
      .filter(
        (q: Question) =>
          assessed.has(q.id) && (!data.topic || q.topics.includes(data.topic)),
      )
      .map((q: Question) => ({ ...q, choiceGroup: undefined }));
    requireThat(
      questions.length,
      "NO_QUESTIONS",
      "No assessed question matches this correction.",
    );
    sources = papers.filter((p) => original.data.paperIds.includes(p.id));
  } else if (data.mode === "mock") {
    const paper = papers.find(
      (p) => p.id === data.paperId && p.fullMockEligible,
    );
    requireThat(
      paper,
      "PAPER_UNAVAILABLE",
      "This complete paper is not available for your course.",
    );
    requireThat(
      paper.questions.every((q) => !q.option || course.option),
      "OPTION_REQUIRED",
      "Select your Psychology option before starting this paper.",
    );
    questions = paper.questions;
    sources = [paper];
  } else {
    let gaps = data.topic ? [data.topic] : due;
    const history = await historyRows(tx, data.learnerId, course.specification);
    gaps = [
      ...new Set([
        ...gaps,
        ...history
          .filter((r) => r.awarded / r.available < 0.6)
          .flatMap((r) => r.topics),
      ]),
    ];
    const budget = data.mode === "guided" ? 10 : 20;
    let selection = chooseQuestions(
      papers,
      data.topic
        ? {
            ...course,
            taughtTopics: course.taughtTopics.filter(
              (t) => t === data.topic || t.startsWith(data.topic + "."),
            ),
          }
        : course,
      budget,
      gaps,
      due,
      data.retryOf ? new Set() : seen,
      releases,
    );
    if (!selection.length && !isTestFamily(familyId))
      selection = (await publishedPracticePapers(
        tx,
        course.subject,
        budget,
      )) as unknown as typeof selection;
    requireThat(
      selection.length,
      "NO_QUESTIONS",
      "No published question is available for this course yet.",
    );
    questions = selection.map((s) => ({
      ...s.question,
      choiceGroup: undefined,
    }));
    sources = [
      ...new Map(selection.map((s) => [s.paper.id, s.paper])).values(),
    ];
  }
  if (data.retryOf) {
    const original = (
      await tx.query(
        "SELECT id FROM assessments WHERE id=$1 AND learner_id=$2 AND state=$3",
        [data.retryOf, data.learnerId, "published"],
      )
    ).rows[0];
    if (!original) throw missing();
  }
  const duration =
    data.mode === "mock"
      ? sources[0].durationMinutes
      : Math.ceil(
          questions.reduce((n, q) => {
            const p = sources.find((p) =>
              p.questions.some((x) => x.id === q.id),
            )!;
            return n + (q.marks * p.durationMinutes) / p.totalMarks;
          }, 0),
        );
  const id = randomUUID();
  const frozen = {
    questions,
    paperIds: sources.map((p) => p.id),
    specification: course.specification,
    subject: course.subject,
    resources: sources.flatMap((p) => p.resources),
    generalRubrics: sources.map((p) => p.generalRubric),
    choices: data.mode === "mock" ? sources[0].choices : [],
    instructions: sources.map((p) => p.instructions).join("\n\n"),
    durationMinutes: duration,
    extraTimePercent: course.extraTimePercent,
    assisted: !!data.retryOf,
    seenQuestionIds: questions
      .filter((q) => allSeen.has(q.id))
      .map((q) => q.id),
    selected: [],
    retryOf: data.retryOf ?? null,
    boundaries: data.mode === "mock" ? sources[0].boundaries : null,
  };
  await tx.query(
    "INSERT INTO attempts(id,family_id,learner_id,mode,data) VALUES($1,$2,$3,$4,$5)",
    [id, familyId, data.learnerId, data.mode, JSON.stringify(frozen)],
  );
  for (const q of questions)
    await tx.query(
      "INSERT INTO answers(attempt_id,family_id,question_id) VALUES($1,$2,$3)",
      [id, familyId, q.id],
    );
  return { id };
}
async function accessibleAttempt(
  tx: Tx,
  actor: Actor,
  familyId: string,
  id: string,
  lock = false,
) {
  const row = (
    await tx.query(
      `SELECT * FROM attempts WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [id],
    )
  ).rows[0];
  if (!row) throw missing();
  await learnerAccess(tx, actor, familyId, row.learner_id);
  return row;
}
export async function getAttempt(actor: Actor, familyId: string, id: string) {
  return family(actor, familyId, async (tx) => {
    const a = await accessibleAttempt(tx, actor, familyId, id, true);
    if (
      a.state === "in_progress" &&
      a.deadline &&
      new Date(a.deadline) <= new Date()
    )
      await freeze(tx, a, "deadline");
    const current = (await tx.query("SELECT * FROM attempts WHERE id=$1", [id]))
      .rows[0];
    const answers = (
      await tx.query(
        "SELECT question_id,text,revision,flagged FROM answers WHERE attempt_id=$1",
        [id],
      )
    ).rows;
    const submittedQuestionIds = (
      await tx.query(
        "SELECT part_key FROM submissions WHERE attempt_id=$1 AND part_key<>'all'",
        [id],
      )
    ).rows.map((r) => r.part_key);
    const {
      generalRubrics: _general,
      boundaries: _boundaries,
      ...safe
    } = current.data;
    // Merely opening questions records exposure, including draft preview.
    for (const q of safe.questions)
      await tx.query(
        "INSERT INTO exposure(family_id,learner_id,question_id,reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [familyId, a.learner_id, q.id, "question_opened"],
      );
    return {
      ...current,
      editor_token: undefined,
      data: {
        ...safe,
        questions: safe.questions.map((q: Question) =>
          studentQuestion(q, a.mode),
        ),
      },
      answers,
      submittedQuestionIds,
      serverNow: new Date().toISOString(),
    };
  });
}
export async function startPractice(tx: Tx, a: any, providedQuoteId?: string) {
  const id = a.id;

  requireThat(
    a.state === "draft",
    "STATE",
    "This attempt has already started.",
  );
  // Freeze pricing internally; starting learning is not a payment decision.
  const quoteId = providedQuoteId ?? (await createQuote(tx, a)).id;
  const quote = (
    await tx.query("SELECT * FROM quotes WHERE id=$1 AND attempt_id=$2", [
      quoteId,
      a.id,
    ])
  ).rows[0];
  requireThat(quote, "QUOTE", "The quote does not belong to this attempt.");
  try {
    await reserve(tx, quoteId);
  } catch (error) {
    if (
      error instanceof AppError &&
      ["AWAITING_FUNDS", "STUDENT_CAP"].includes(error.code)
    ) {
      await tx.query("UPDATE quotes SET accepted_at=now() WHERE id=$1", [
        quoteId,
      ]);
    } else throw error;
  }
  const editorToken = randomBytes(32).toString("base64url");
  const duration = Math.ceil(
    a.data.durationMinutes * 60 * (1 + a.data.extraTimePercent / 100),
  );
  const timed = a.mode === "timed" || a.mode === "mock";
  await tx.query(
    "UPDATE attempts SET state='in_progress',started_at=clock_timestamp(),deadline=CASE WHEN $2 THEN clock_timestamp()+($3*interval '1 second') ELSE NULL END,editor_token=$4,editor_epoch=editor_epoch+1,data=jsonb_set(data,'{quoteId}',to_jsonb($5::text)) WHERE id=$1",
    [id, timed, duration, editorToken, quoteId],
  );
  if (timed)
    await enqueue(
      tx,
      "deadline",
      `deadline:${id}`,
      { attemptId: id, delaySeconds: duration },
      a.family_id,
    );
  return { editorToken };
}
export async function attemptAction(
  actor: Actor,
  familyId: string,
  id: string,
  input: unknown,
) {
  const data = z
    .discriminatedUnion("action", [
      z.object({ action: z.literal("quote") }),
      z.object({
        action: z.literal("start"),
        quoteId: z.string().uuid().optional(),
      }),
      z.object({ action: z.literal("takeover") }),
      z.object({ action: z.literal("abandon") }),
      z.object({
        action: z.literal("save"),
        questionId: z.string(),
        text: z.string().max(50000),
        revision: z.number().int().nonnegative(),
        editorToken: z.string(),
        flagged: z.boolean().default(false),
      }),
      z.object({
        action: z.literal("choices"),
        selected: z.array(z.string()),
        editorToken: z.string(),
      }),
      z.object({
        action: z.literal("submit"),
        editorToken: z.string(),
        questionId: z.string().optional(),
      }),
      z.object({
        action: z.literal("recover"),
        answers: z.record(z.string(), z.string().max(50000)),
      }),
      z.object({ action: z.literal("hint"), questionId: z.string() }),
    ])
    .parse(input);
  return family(actor, familyId, async (tx) => {
    const a = await accessibleAttempt(tx, actor, familyId, id, true);
    if (data.action === "recover") {
      await tx.query(
        "INSERT INTO recovered_work(id,family_id,learner_id,attempt_id,text) VALUES($1,$2,$3,$4,$5)",
        [
          randomUUID(),
          familyId,
          a.learner_id,
          a.id,
          JSON.stringify(data.answers),
        ],
      );
      return { recovered: true };
    }
    if (data.action === "submit" && a.state === "submitted") {
      const existing = (
        await tx.query(
          "SELECT id FROM submissions WHERE attempt_id=$1 AND part_key=$2",
          [id, a.mode === "guided" ? data.questionId : "all"],
        )
      ).rows[0];
      if (existing) return { submission: existing.id };
    }
    if (
      a.state === "in_progress" &&
      a.deadline &&
      new Date(a.deadline) <= new Date()
    ) {
      const submission = await freeze(tx, a, "deadline");
      return { expired: true, submission };
    }
    if (data.action === "quote") {
      requireThat(
        a.state === "draft",
        "STATE",
        "This attempt has already started.",
      );
      return createQuote(tx, a);
    }
    if (data.action === "start") return startPractice(tx, a, data.quoteId);
    if (data.action === "takeover") {
      requireThat(
        a.state === "in_progress",
        "STATE",
        "Only an active attempt can be edited.",
      );
      const token = randomBytes(32).toString("base64url");
      await tx.query(
        "UPDATE attempts SET editor_token=$2,editor_epoch=editor_epoch+1 WHERE id=$1",
        [id, token],
      );
      await audit(
        tx,
        actor.id,
        "attempt.takeover",
        { attemptId: id },
        familyId,
      );
      return { editorToken: token };
    }
    if (data.action === "hint") {
      requireThat(
        a.mode === "guided" && a.state === "in_progress",
        "HINT_UNAVAILABLE",
        "Hints are unavailable in this mode.",
      );
      const q = a.data.questions.find(
        (q: Question) => q.id === data.questionId,
      );
      if (!q) throw missing();
      await tx.query(
        "UPDATE attempts SET data=jsonb_set(data,'{assisted}','true') WHERE id=$1",
        [id],
      );
      return { hints: q.hints };
    }
    if (data.action === "abandon") {
      requireThat(
        a.state !== "submitted",
        "STATE",
        "Submitted work cannot be abandoned.",
      );
      const submitted = await tx.query(
        "SELECT id FROM submissions WHERE attempt_id=$1",
        [id],
      );
      requireThat(
        !submitted.rows.length,
        "STATE",
        "Finish the remaining guided answers before closing a partially submitted set.",
      );
      await tx.query("UPDATE attempts SET state='abandoned' WHERE id=$1", [id]);
      if (a.data.quoteId) await release(tx, a.data.quoteId);
      return { abandoned: true };
    }
    requireThat(
      a.state === "in_progress",
      "STATE",
      "This attempt is no longer editable.",
    );
    requireThat(
      a.editor_token === data.editorToken,
      "EDITOR_CONFLICT",
      "Another device owns this attempt. Take over explicitly to continue.",
      409,
    );
    if (data.action === "choices") {
      await tx.query(
        "UPDATE attempts SET data=jsonb_set(data,'{selected}',$2) WHERE id=$1",
        [id, JSON.stringify(data.selected)],
      );
      return { saved: true };
    }
    if (data.action === "save") {
      const quote = (
        await tx.query("SELECT configuration FROM quotes WHERE id=$1", [
          a.data.quoteId,
        ])
      ).rows[0];
      requireThat(
        quote && data.text.length <= quote.configuration.maxAnswerChars,
        "ANSWER_LIMIT",
        `This marking configuration allows ${quote?.configuration.maxAnswerChars ?? 0} characters per answer.`,
      );
      const submitted = await tx.query(
        "SELECT id FROM submissions WHERE attempt_id=$1 AND (part_key=$2 OR part_key=$3)",
        [id, data.questionId, "all"],
      );
      requireThat(
        !submitted.rows.length,
        "IMMUTABLE",
        "This answer has already been submitted.",
      );
      const updated = await tx.query(
        "UPDATE answers SET text=$4,revision=revision+1,flagged=$5,updated_at=clock_timestamp() WHERE attempt_id=$1 AND question_id=$2 AND revision=$3 AND EXISTS(SELECT 1 FROM attempts a WHERE a.id=$1 AND (a.deadline IS NULL OR a.deadline>clock_timestamp())) RETURNING revision",
        [id, data.questionId, data.revision, data.text, data.flagged],
      );
      if (
        !updated.rows.length &&
        a.deadline &&
        new Date(a.deadline) <= new Date()
      )
        return { expired: true, submission: await freeze(tx, a, "deadline") };
      requireThat(
        updated.rows.length,
        "REVISION_CONFLICT",
        "A newer saved answer exists. Your local writing has been kept.",
        409,
      );
      return { revision: updated.rows[0].revision };
    }
    return { submission: await freeze(tx, a, "manual", data.questionId) };
  });
}
export async function freeze(
  tx: Tx,
  a: any,
  reason: "manual" | "deadline",
  questionId?: string,
) {
  const part = a.mode === "guided" && questionId ? questionId : "all";
  const existing = (
    await tx.query(
      "SELECT id FROM submissions WHERE attempt_id=$1 AND part_key=$2",
      [a.id, part],
    )
  ).rows[0];
  if (existing) return existing.id;
  requireThat(a.state === "in_progress", "STATE", "Attempt is not active.");
  if (a.mode === "guided")
    requireThat(
      questionId && a.data.questions.some((q: Question) => q.id === questionId),
      "QUESTION",
      "Submit one guided answer at a time.",
    );
  let choicesValid = true;
  try {
    selectedQuestions(
      { questions: a.data.questions, choices: a.data.choices } as Paper,
      a.data.selected ?? [],
    );
  } catch {
    choicesValid = false;
  }
  const rows = (
    await tx.query(
      "SELECT question_id,text,revision FROM answers WHERE attempt_id=$1 AND ($2=$3 OR question_id=$2)",
      [a.id, part, "all"],
    )
  ).rows;
  const id = randomUUID();
  await tx.query(
    "INSERT INTO submissions(id,family_id,learner_id,attempt_id,part_key,answers,choices,ended_by,submitted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,clock_timestamp()))",
    [
      id,
      a.family_id,
      a.learner_id,
      a.id,
      part,
      JSON.stringify(rows),
      JSON.stringify(a.data.selected ?? []),
      reason,
      reason === "deadline" ? a.deadline : null,
    ],
  );
  const assessmentId = randomUUID();
  let funded = true;
  try {
    await reserve(tx, a.data.quoteId, true);
  } catch (error) {
    if (
      error instanceof AppError &&
      ["AWAITING_FUNDS", "STUDENT_CAP"].includes(error.code)
    )
      funded = false;
    else throw error;
  }
  await tx.query(
    "INSERT INTO assessments(id,family_id,learner_id,submission_id,state,error_code) VALUES($1,$2,$3,$4,$5,$6)",
    [
      assessmentId,
      a.family_id,
      a.learner_id,
      id,
      choicesValid ? (funded ? "queued" : "awaiting_funds") : "needs_review",
      choicesValid ? null : "INVALID_CHOICES",
    ],
  );
  if (part === "all")
    await tx.query(
      "UPDATE attempts SET state='submitted',editor_token=NULL WHERE id=$1",
      [a.id],
    );
  else {
    const count = (
      await tx.query("SELECT count(*) FROM submissions WHERE attempt_id=$1", [
        a.id,
      ])
    ).rows[0].count;
    if (Number(count) === a.data.questions.length)
      await tx.query(
        "UPDATE attempts SET state='submitted',editor_token=NULL WHERE id=$1",
        [a.id],
      );
  }
  if (choicesValid && funded)
    await enqueue(
      tx,
      "mark",
      `mark:${assessmentId}`,
      { assessmentId },
      a.family_id,
    );
  await tx.query(
    "UPDATE study_sessions SET state='completed' WHERE data->>'attemptId'=$1 AND state='approved'",
    [a.id],
  );
  return id;
}
export async function historyRows(
  tx: Tx,
  learnerId: string,
  specification: string,
): Promise<HistoryEvidence[]> {
  const rows = (
    await tx.query(
      "SELECT s.id,s.submitted_at,a.mode,a.data,r.effective FROM assessments r JOIN submissions s ON s.id=r.submission_id JOIN attempts a ON a.id=s.attempt_id WHERE r.learner_id=$1 AND r.state='published' AND a.data->>'specification'=$2 ORDER BY s.submitted_at",
      [learnerId, specification],
    )
  ).rows;
  return rows.flatMap((row) =>
    (row.effective ?? []).map((r: any) => {
      const q = row.data.questions.find((q: Question) => q.id === r.questionId);
      return {
        submissionId: row.id,
        questionId: r.questionId,
        submittedAt: new Date(row.submitted_at).toISOString(),
        mode: row.mode,
        assisted: row.data.assisted,
        seen: row.data.seenQuestionIds.includes(r.questionId),
        specification,
        topics: q.topics,
        awarded: r.awarded,
        available: r.available,
        feedback: r.improvement,
      };
    }),
  );
}
export async function topicHistory(
  actor: Actor,
  familyId: string,
  input: unknown,
) {
  const data = z
    .object({
      learnerId: z.string().uuid(),
      specification: z.string(),
      topic: z.string(),
      from: z
        .string()
        .datetime()
        .default(() => new Date(Date.now() - 90 * 86400000).toISOString()),
      to: z
        .string()
        .datetime()
        .default(() => new Date().toISOString()),
      mode: Mode.optional(),
      assisted: z.boolean().default(false),
    })
    .parse(input);
  return family(actor, familyId, async (tx) => {
    await learnerAccess(tx, actor, familyId, data.learnerId);
    const rows = (
      await historyRows(tx, data.learnerId, data.specification)
    ).filter(
      (r) =>
        r.submittedAt >= data.from &&
        r.submittedAt <= data.to &&
        r.assisted === data.assisted &&
        (!data.mode ? r.mode !== "guided" : r.mode === data.mode),
    );
    const topics = new Set(
      rows
        .flatMap((r) => r.topics)
        .filter((t) => t === data.topic || t.startsWith(data.topic + ".")),
    );
    return aggregateHistory(rows, topics);
  });
}
