import { z } from "zod";
import { database, family, learnerAccess, type Actor } from "./db";
import { requireThat } from "../lib/errors";
import { completionSummary } from "../lib/motivation";
type Access = {
  database: () => Pick<ReturnType<typeof database>, "query">;
  family: typeof family;
};
const defaultAccess: Access = { database, family };

export async function motivation(
  actor: Actor,
  familyId: string,
  learnerId: string,
  access = defaultAccess,
) {
  return access.family(actor, familyId, async (tx) => {
    const role = await learnerAccess(tx, actor, familyId, learnerId);
    requireThat(
      role === "student",
      "FORBIDDEN",
      "Student access required.",
      403,
    );
    const learner = (
      await tx.query(
        "SELECT weekly_goal,goal_timezone FROM learners WHERE id=$1",
        [learnerId],
      )
    ).rows[0];
    const rows = (
      await tx.query(
        "SELECT s.attempt_id,s.submitted_at,s.answers FROM submissions s JOIN attempts a ON a.id=s.attempt_id WHERE s.learner_id=$1 AND a.state='submitted' ORDER BY s.submitted_at",
        [learnerId],
      )
    ).rows;
    return {
      goal: learner.weekly_goal,
      timezone: learner.goal_timezone,
      ...completionSummary(rows as any, learner.goal_timezone),
    };
  });
}
export async function saveMotivation(
  actor: Actor,
  familyId: string,
  input: unknown,
  access = defaultAccess,
) {
  const data = z
    .object({
      learnerId: z.string().uuid(),
      goal: z.number().int().min(1).max(7),
      timezone: z
        .string()
        .max(100)
        .refine((value) => {
          try {
            new Intl.DateTimeFormat("en", { timeZone: value });
            return true;
          } catch {
            return false;
          }
        }),
    })
    .parse(input);
  await access.family(actor, familyId, async (tx) => {
    const role = await learnerAccess(tx, actor, familyId, data.learnerId);
    requireThat(
      role === "student",
      "FORBIDDEN",
      "Student access required.",
      403,
    );
    await tx.query(
      "UPDATE learners SET weekly_goal=$2,goal_timezone=$3 WHERE id=$1",
      [data.learnerId, data.goal, data.timezone],
    );
  });
  return motivation(actor, familyId, data.learnerId, access);
}

// Each read stays inside its family's RLS transaction. No global RLS bypass.
export async function teacherWorkspace(
  actor: Actor,
  params: URLSearchParams,
  access = defaultAccess,
) {
  const filters = z
    .object({
      view: z.enum(["overview", "students", "reviews"]).default("overview"),
      offset: z.coerce.number().int().min(0).max(100000).default(0),
      family: z.string().uuid().optional(),
      learner: z.string().uuid().optional(),
      subject: z.enum(["psychology", "business"]).optional(),
      status: z
        .enum([
          "needs_review",
          "failed",
          "awaiting_funds",
          "published",
          "queued",
          "marking",
          "validating",
        ])
        .optional(),
      search: z.string().max(100).default(""),
    })
    .parse(Object.fromEntries(params));
  const memberships = (
    await access
      .database()
      .query(
        "SELECT f.id,f.name FROM families f JOIN memberships m ON m.family_id=f.id WHERE m.user_id=$1 AND m.role='teacher' AND m.active AND NOT f.suspended AND f.deleted_at IS NULL ORDER BY f.name,f.id",
        [actor.id],
      )
  ).rows;
  requireThat(
    memberships.length > 0,
    "FORBIDDEN",
    "Teacher access required.",
    403,
  );
  const students: any[] = [],
    reviews: any[] = [];
  let studentTotal = 0,
    reviewTotal = 0,
    actionable = 0,
    blocked = 0;
  for (const workspace of memberships.filter(
    (w) => !filters.family || w.id === filters.family,
  )) {
    await access.family(actor, workspace.id, async (tx, role) => {
      requireThat(
        role === "teacher",
        "FORBIDDEN",
        "Teacher access required.",
        403,
      );
      const values = [
        filters.learner ?? null,
        filters.subject ?? null,
        filters.search,
        filters.offset + 26,
      ];
      const scope = `($1::uuid IS NULL OR l.id=$1) AND ($2::text IS NULL OR EXISTS(SELECT 1 FROM enrolments e WHERE e.learner_id=l.id AND e.data->>'subject'=$2)) AND strpos(lower(l.name),lower($3))>0 AND ($5::text IS NULL OR EXISTS(SELECT 1 FROM assessments r WHERE r.learner_id=l.id AND r.state=$5))`;
      const people = await tx.query(
        `SELECT l.id,l.name,COALESCE((SELECT jsonb_agg(e.data) FROM enrolments e WHERE e.learner_id=l.id),'[]') AS courses, (SELECT count(*)::int FROM assessments r WHERE r.learner_id=l.id AND r.state='needs_review') AS pending, (SELECT count(*)::int FROM attempts a WHERE a.learner_id=l.id AND a.state IN ('draft','in_progress')) AS open_attempts, (SELECT jsonb_build_object('state',r.state,'effective',CASE WHEN r.state='published' THEN r.effective ELSE NULL END) FROM assessments r JOIN submissions s ON s.id=r.submission_id WHERE r.learner_id=l.id ORDER BY s.submitted_at DESC,r.id DESC LIMIT 1) AS latest, count(*) OVER()::int AS total FROM learners l WHERE ${scope} ORDER BY lower(l.name),l.id LIMIT $4`,
        [...values, filters.status ?? null],
      );
      studentTotal += people.rows[0]?.total ?? 0;
      students.push(
        ...people.rows.map((row) => ({
          ...row,
          family_id: workspace.id,
          family_name: workspace.name,
        })),
      );
      const reviewScope = `($1::uuid IS NULL OR l.id=$1) AND ($2::text IS NULL OR a.data->>'subject'=$2) AND strpos(lower(l.name),lower($3))>0 AND ($5::text IS NULL OR r.state=$5)`;
      const states =
        filters.view === "students" && filters.learner
          ? "r.state<>'cancelled'"
          : "r.state IN ('needs_review','failed','awaiting_funds','queued','marking','validating')";
      const items = await tx.query(
        `SELECT r.id,r.learner_id,l.name AS learner_name,r.state,r.error_code,EXISTS(SELECT 1 FROM review_decisions d WHERE d.assessment_id=r.id AND d.data->>'action'='query') AS has_query,CASE WHEN r.state='published' THEN r.effective ELSE NULL END AS effective,s.submitted_at,a.mode,a.data->>'subject' AS subject,count(*) OVER()::int AS total FROM assessments r JOIN learners l ON l.id=r.learner_id JOIN submissions s ON s.id=r.submission_id JOIN attempts a ON a.id=s.attempt_id WHERE ${states} AND ${reviewScope} ORDER BY s.submitted_at,r.id LIMIT $4`,
        [...values, filters.status ?? null],
      );
      reviewTotal += items.rows[0]?.total ?? 0;
      reviews.push(
        ...items.rows.map((row) => ({
          ...row,
          family_id: workspace.id,
          family_name: workspace.name,
        })),
      );
      const counts = (
        await tx.query(
          `SELECT count(*) FILTER(WHERE r.state='needs_review')::int AS actionable,count(*) FILTER(WHERE r.state IN ('failed','awaiting_funds'))::int AS blocked FROM assessments r JOIN learners l ON l.id=r.learner_id JOIN submissions s ON s.id=r.submission_id JOIN attempts a ON a.id=s.attempt_id WHERE ${reviewScope.replaceAll("$5", "$4")}`,
          [values[0], values[1], values[2], filters.status ?? null],
        )
      ).rows[0];
      actionable += counts.actionable;
      blocked += counts.blocked;
    });
  }
  students.sort(
    (a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
      a.id.localeCompare(b.id),
  );
  reviews.sort(
    (a, b) =>
      new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime() ||
      a.id.localeCompare(b.id),
  );
  return {
    families: memberships,
    students: filters.learner
      ? students.slice(0, 1)
      : students.slice(filters.offset, filters.offset + 25),
    reviews: reviews.slice(filters.offset, filters.offset + 25),
    totals: {
      students: studentTotal,
      reviews: reviewTotal,
      actionable,
      blocked,
    },
    offset: filters.offset,
    pageSize: 25,
  };
}
