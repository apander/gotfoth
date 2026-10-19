import { z } from "zod";
import {
  database,
  family,
  learnerAccess,
  superuser,
  transaction,
  type Actor,
  type Tx,
} from "./db";
import { requireThat, missing } from "../lib/errors";
import { learnerStatus } from "../lib/personas";
import { catalogue } from "./learning";

export const pagination = (params: URLSearchParams) => ({
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .max(1000000)
    .parse(params.get("offset") ?? 0),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(params.get("limit") ?? 25),
});
async function accessibleLearners(
  tx: Tx,
  actor: Actor,
  familyId: string,
  role: string,
) {
  requireThat(
    ["student", "parent", "teacher"].includes(role),
    "FORBIDDEN",
    "Choose your family membership.",
    403,
  );
  return (
    await tx.query(
      role === "student"
        ? "SELECT l.* FROM learners l JOIN memberships m ON m.learner_id=l.id AND m.family_id=l.family_id WHERE m.user_id=$1 AND m.active AND m.role='student' AND l.family_id=$2 ORDER BY l.name"
        : "SELECT l.* FROM learners l WHERE $1::text IS NOT NULL AND l.family_id=$2 ORDER BY l.name",
      [actor.id, familyId],
    )
  ).rows;
}
export async function companionSummary(actor: Actor, familyId: string) {
  return family(actor, familyId, async (tx, role) => {
    const learners = await accessibleLearners(tx, actor, familyId, role),
      ids = learners.map((l) => l.id);
    const enrolments = (
      await tx.query(
        "SELECT * FROM enrolments WHERE learner_id=ANY($1::uuid[]) ORDER BY learner_id,id",
        [ids],
      )
    ).rows;
    const attempts: any[] = [],
      assessments: any[] = [],
      sessions: any[] = [];
    for (const learner of learners) {
      attempts.push(
        ...(
          await tx.query(
            "SELECT id,learner_id,mode,state,started_at,deadline,created_at,data->>'subject' AS subject,data->>'durationMinutes' AS duration_minutes FROM attempts WHERE learner_id=$1 ORDER BY (state IN ('draft','in_progress')) DESC,created_at DESC LIMIT 5",
            [learner.id],
          )
        ).rows,
      );
      assessments.push(
        ...(
          await tx.query(
            "SELECT r.id,r.learner_id,r.state,CASE WHEN r.state='published' THEN r.effective ELSE NULL END AS effective,r.published_at,s.submitted_at,a.mode,a.data->>'subject' AS subject FROM assessments r JOIN submissions s ON s.id=r.submission_id JOIN attempts a ON a.id=s.attempt_id WHERE r.learner_id=$1 AND r.state<>'cancelled' ORDER BY s.submitted_at DESC,r.id DESC LIMIT 5",
            [learner.id],
          )
        ).rows,
      );
      sessions.push(
        ...(
          await tx.query(
            "SELECT * FROM study_sessions WHERE learner_id=$1 AND state='approved' AND (data->>'start')::timestamptz>=now()-interval '1 day' ORDER BY data->>'start' LIMIT 5",
            [learner.id],
          )
        ).rows,
      );
    }
    const calendar =
      (
        await tx.query(
          "SELECT state FROM calendar_connections WHERE user_id=$1",
          [actor.id],
        )
      ).rows[0]?.state ?? "disconnected";
    const topics: Record<string, string[]> = {};
    if (role === "student")
      for (const paper of await catalogue(tx, familyId))
        topics[paper.subject] = [
          ...new Set([
            ...(topics[paper.subject] ?? []),
            ...paper.questions.flatMap((q) => q.topics),
          ]),
        ].sort();
    return {
      role,
      learners: learners.map(({ monthly_cap, ...l }) =>
        role === "parent" ? { ...l, monthly_cap } : l,
      ),
      enrolments,
      topics,
      attempts: attempts.map((a) => ({ ...a, state: a.state })),
      assessments: assessments.map((a) =>
        role === "student"
          ? { ...a, display_state: learnerStatus(a.state) }
          : a,
      ),
      sessions,
      calendar,
    };
  });
}
export async function diaryRead(
  actor: Actor,
  familyId: string,
  params: URLSearchParams,
) {
  const { offset, limit } = pagination(params);
  const from = z
    .string()
    .date()
    .parse(params.get("from") ?? new Date().toISOString().slice(0, 10));
  const to = z
    .string()
    .date()
    .parse(
      params.get("to") ??
        new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10),
    );
  requireThat(from <= to, "DATE", "Choose a valid date range.");
  return family(actor, familyId, async (tx, role) => {
    const learners = await accessibleLearners(tx, actor, familyId, role);
    const ids = learners
      .filter((l) => !params.get("learner") || l.id === params.get("learner"))
      .map((l) => l.id);
    const scope =
      "learner_id=ANY($1::uuid[]) AND state<>'cancelled' AND (((data->>'start')::timestamptz AT TIME ZONE (data->>'timezone'))::date BETWEEN $2::date AND $3::date) AND ($4::boolean OR state IN ('approved','completed'))";
    const values = [ids, from, to, role === "student"];
    const total = Number(
      (
        await tx.query(
          `SELECT count(*) FROM study_sessions WHERE ${scope}`,
          values,
        )
      ).rows[0].count,
    );
    const items = (
      await tx.query(
        `SELECT * FROM study_sessions WHERE ${scope} ORDER BY data->>'start',id LIMIT $5 OFFSET $6`,
        [...values, limit, offset],
      )
    ).rows;
    const exams = (
      await tx.query(
        "SELECT id,learner_id,data FROM enrolments WHERE learner_id=ANY($1::uuid[])",
        [ids],
      )
    ).rows.flatMap((e) =>
      e.data.examDates
        .filter((d: any) => d.date >= from && d.date <= to)
        .map((d: any) => ({
          ...d,
          id: `${e.id}:${d.unit}`,
          subject: e.data.subject,
          learner_id: e.learner_id,
          timezone: e.data.timezone,
        })),
    );
    return { items, exams, total, offset, limit, from, to };
  });
}
export async function activityRead(
  actor: Actor,
  familyId: string,
  params: URLSearchParams,
) {
  const learnerId = z.string().uuid().parse(params.get("learner"));
  const { offset, limit } = pagination(params);
  const kind = z
    .enum(["assessments", "attempts"])
    .parse(params.get("kind") ?? "assessments");
  const subject = z
    .enum(["psychology", "business"])
    .optional()
    .parse(params.get("subject") || undefined);
  const from = z
      .string()
      .date()
      .optional()
      .parse(params.get("from") || undefined),
    to = z
      .string()
      .date()
      .optional()
      .parse(params.get("to") || undefined);
  requireThat(!from || !to || from <= to, "DATE", "Choose a valid date range.");
  return family(actor, familyId, async (tx) => {
    const role = await learnerAccess(tx, actor, familyId, learnerId);
    if (kind === "attempts") {
      const vals = [
        learnerId,
        subject ?? null,
        from ? from + "T00:00:00Z" : null,
        to ? to + "T23:59:59.999Z" : null,
      ];
      const scope =
        "learner_id=$1 AND ($2::text IS NULL OR data->>'subject'=$2) AND ($3::timestamptz IS NULL OR created_at>=$3) AND ($4::timestamptz IS NULL OR created_at<=$4)";
      const total = Number(
        (await tx.query(`SELECT count(*) FROM attempts WHERE ${scope}`, vals))
          .rows[0].count,
      );
      const items = (
        await tx.query(
          `SELECT id,learner_id,mode,state,created_at,started_at,deadline,data->>'subject' AS subject,data->>'durationMinutes' AS duration_minutes FROM attempts WHERE ${scope} ORDER BY created_at DESC,id DESC LIMIT $5 OFFSET $6`,
          [...vals, limit, offset],
        )
      ).rows;
      return { items, total, offset, limit };
    }
    const scope =
      "r.learner_id=$1 AND ($2::text IS NULL OR a.data->>'subject'=$2) AND (r.state='published' OR $3::boolean) AND ($4::timestamptz IS NULL OR s.submitted_at>=$4) AND ($5::timestamptz IS NULL OR s.submitted_at<=$5)";
    const vals = [
      learnerId,
      subject ?? null,
      role === "teacher",
      from ? from + "T00:00:00Z" : null,
      to ? to + "T23:59:59.999Z" : null,
    ];
    const total = Number(
      (
        await tx.query(
          `SELECT count(*) FROM assessments r JOIN submissions s ON s.id=r.submission_id JOIN attempts a ON a.id=s.attempt_id WHERE ${scope}`,
          vals,
        )
      ).rows[0].count,
    );
    const items = (
      await tx.query(
        `SELECT r.id,r.learner_id,r.state,r.published_at,s.submitted_at,a.mode,a.data->>'subject' AS subject,a.data->>'assisted' AS assisted,CASE WHEN r.state='published' THEN r.effective ELSE NULL END AS effective FROM assessments r JOIN submissions s ON s.id=r.submission_id JOIN attempts a ON a.id=s.attempt_id WHERE ${scope} ORDER BY s.submitted_at DESC,r.id DESC LIMIT $6 OFFSET $7`,
        [...vals, limit, offset],
      )
    ).rows;
    return { items, total, offset, limit };
  });
}
export async function attemptSummary(
  actor: Actor,
  familyId: string,
  id: string,
) {
  z.string().uuid().parse(id);
  return family(actor, familyId, async (tx) => {
    const a = (
      await tx.query(
        "SELECT id,learner_id,state,mode,deadline,data->>'subject' AS subject,data->>'durationMinutes' AS duration_minutes,(SELECT max(updated_at) FROM answers WHERE attempt_id=$1) AS saved_at FROM attempts WHERE id=$1 AND family_id=$2",
        [id, familyId],
      )
    ).rows[0];
    if (!a) throw missing();
    await learnerAccess(tx, actor, familyId, a.learner_id);
    return a; // Deliberately never reads the frozen questions or acquires an editor.
  });
}
export async function fundingRead(
  actor: Actor,
  familyId: string,
  params: URLSearchParams,
) {
  const { offset, limit } = pagination(params);
  const paymentId = z
    .string()
    .uuid()
    .optional()
    .parse(params.get("paymentId") || undefined);
  return family(actor, familyId, async (tx, role) => {
    requireThat(role === "parent", "FORBIDDEN", "Parent access required.", 403);
    const learners = (
      await tx.query(
        "SELECT id,name,monthly_cap FROM learners WHERE family_id=$1 ORDER BY name",
        [familyId],
      )
    ).rows;
    const balance =
      (
        await tx.query(
          "SELECT balance FROM funding_accounts WHERE family_id=$1",
          [familyId],
        )
      ).rows[0]?.balance ?? 0;
    const reserved = (
      await tx.query(
        "SELECT COALESCE(sum(amount),0) AS amount FROM reservations WHERE family_id=$1 AND released_at IS NULL AND settled IS NULL",
        [familyId],
      )
    ).rows[0].amount;
    const total = Number(
      (
        await tx.query("SELECT count(*) FROM ledger WHERE family_id=$1", [
          familyId,
        ])
      ).rows[0].count,
    );
    const ledger = (
      await tx.query(
        "SELECT id,amount,kind,created_at FROM ledger WHERE family_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3",
        [familyId, limit, offset],
      )
    ).rows;
    const awaiting = (
      await tx.query(
        `SELECT r.id,l.name,a.data->>'subject' AS subject,q.max_charge,l.monthly_cap-COALESCE((SELECT sum(CASE WHEN settled IS NULL AND released_at IS NULL THEN amount ELSE COALESCE(settled,0) END) FROM reservations WHERE learner_id=l.id AND month=to_char(now() AT TIME ZONE 'UTC','YYYY-MM')),0) AS remaining_cap FROM assessments r JOIN learners l ON l.id=r.learner_id JOIN submissions s ON s.id=r.submission_id JOIN attempts a ON a.id=s.attempt_id JOIN quotes q ON q.id=(a.data->>'quoteId')::uuid WHERE r.family_id=$1 AND r.state='awaiting_funds' ORDER BY s.submitted_at,r.id`,
        [familyId],
      )
    ).rows;
    const payments = (
      await tx.query(
        "SELECT id,status,credited_cents,expected_cents FROM payments WHERE family_id=$1 AND status<>'pending' ORDER BY id LIMIT 10",
        [familyId],
      )
    ).rows;
    const payment = paymentId
      ? ((
          await tx.query(
            "SELECT id,status,credited_cents,expected_cents FROM payments WHERE family_id=$1 AND id=$2",
            [familyId, paymentId],
          )
        ).rows[0] ?? null)
      : null;
    return {
      learners,
      wallet: { balance, reserved, ledger, awaiting },
      payments,
      payment,
      total,
      offset,
      limit,
    };
  });
}
export async function operatorRead(actor: Actor, params: URLSearchParams) {
  await superuser(actor);
  const { offset, limit } = pagination(params),
    search = (params.get("search") ?? "").slice(0, 100);
  const kind = z
    .enum(["families", "invitations", "content", "operations"])
    .parse(params.get("kind") ?? "families");
  const counts = (
    await database().query(
      `SELECT (SELECT count(*)::int FROM families WHERE deleted_at IS NULL) AS families,(SELECT count(*)::int FROM invitations WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()) AS invitations,(SELECT count(*)::int FROM catalogue WHERE status<>'published') AS content,(SELECT count(*)::int FROM outbox WHERE state='failed' OR (state='running' AND locked_at<now()-interval '15 minutes')) AS operations`,
    )
  ).rows[0];
  const queries = {
    families:
      "SELECT id,name,suspended,created_at FROM families WHERE deleted_at IS NULL AND strpos(lower(name),lower($3))>0 ORDER BY lower(name),id LIMIT $1 OFFSET $2",
    invitations:
      "SELECT i.id,i.family_id,f.name AS family_name,i.email,i.role,i.expires_at,i.accepted_at,i.revoked_at FROM invitations i JOIN families f ON f.id=i.family_id WHERE strpos(lower(i.email),lower($3))>0 ORDER BY i.expires_at DESC,i.id LIMIT $1 OFFSET $2",
    content:
      "SELECT id,identity,version,status FROM catalogue WHERE status<>'published' AND strpos(lower(identity),lower($3))>0 ORDER BY identity,version LIMIT $1 OFFSET $2",
    operations:
      "SELECT id,kind,state,created_at FROM outbox WHERE state<>'done' AND strpos(lower(kind),lower($3))>0 ORDER BY created_at,id LIMIT $1 OFFSET $2",
  };
  const items = (
    await database().query(queries[kind], [limit + 1, offset, search])
  ).rows;
  let members: any[] = [],
    familyInvitations: any[] = [];
  const id = params.get("id");
  if (id && kind === "families") {
    z.string().uuid().parse(id);
    await transaction(async (tx) => {
      requireThat(
        (
          await tx.query(
            "SELECT id FROM families WHERE id=$1 AND deleted_at IS NULL",
            [id],
          )
        ).rows.length,
        "NOT_FOUND",
        "This family is unavailable.",
        404,
      );
      members = (
        await tx.query(
          'SELECT m.role,m.active,u.email,COALESCE(m.display_name,u.name) AS name FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.family_id=$1 ORDER BY name',
          [id],
        )
      ).rows;
      familyInvitations = (
        await tx.query(
          "SELECT id,email,role,expires_at,accepted_at,revoked_at FROM invitations WHERE family_id=$1 ORDER BY expires_at DESC",
          [id],
        )
      ).rows;
    }, id);
  }
  return {
    counts,
    kind,
    items: items.slice(0, limit),
    more: items.length > limit,
    offset,
    limit,
    members,
    invitations: familyInvitations,
  };
}
