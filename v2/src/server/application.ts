import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Enrolment } from "../lib/contracts";
import {
  accountIsSuperuser,
  database,
  family,
  learnerAccess,
  superuser,
  transaction,
  audit,
  type Actor,
} from "./db";
import { requireThat, missing } from "../lib/errors";
import { catalogue } from "./learning";
import { RateCard, credit } from "./finance";
export async function identity(actor: Actor) {
  const operator = await accountIsSuperuser(actor);
  const person = await database().query('SELECT name FROM "user" WHERE id=$1', [
    actor.id,
  ]);
  const workspaces = (
    await database().query(
      operator
        ? `SELECT f.id, f.name, m.role
           FROM families f
           LEFT JOIN memberships m ON m.family_id=f.id AND m.user_id=$1 AND m.active
           WHERE f.deleted_at IS NULL AND NOT f.suspended
           ORDER BY lower(f.name)`
        : `SELECT f.id, f.name, m.role
           FROM memberships m
           JOIN families f ON f.id=m.family_id
           WHERE m.user_id=$1 AND m.active AND NOT f.suspended AND f.deleted_at IS NULL
           ORDER BY lower(f.name)`,
      [actor.id],
    )
  ).rows;
  return {
    user: {
      id: actor.id,
      email: actor.email,
      name: (person.rows[0]?.name as string | undefined)?.trim() ?? "",
    },
    superuser: operator,
    workspaces,
  };
}
export async function snapshot(actor: Actor, familyId: string) {
  return family(actor, familyId, async (tx, role) => {
    const learners = (
      await tx.query(
        role === "parent" || role === "teacher" || role === "superuser"
          ? "SELECT * FROM learners WHERE family_id=$1 ORDER BY name"
          : `SELECT l.* FROM learners l
             JOIN memberships m ON m.family_id=l.family_id AND m.user_id=$2 AND m.active
             WHERE l.family_id=$1 AND m.role='student' AND m.learner_id=l.id
             ORDER BY l.name`,
        role === "parent" || role === "teacher" || role === "superuser"
          ? [familyId]
          : [familyId, actor.id],
      )
    ).rows;
    const ids = learners.map((l) => l.id);
    const enrolments = (
      await tx.query(
        "SELECT * FROM enrolments WHERE learner_id=ANY($1::uuid[])",
        [ids],
      )
    ).rows;
    const attempts = (
      await tx.query(
        "SELECT id,learner_id,mode,state,started_at,deadline,created_at,data->>'subject' AS subject FROM attempts WHERE learner_id=ANY($1::uuid[]) ORDER BY created_at DESC LIMIT 50",
        [ids],
      )
    ).rows;
    const assessments = (
      await tx.query(
        `SELECT r.id,r.learner_id,r.state,r.error_code,r.published_at,s.id AS submission_id,s.submitted_at,a.mode,CASE WHEN r.state='published' THEN r.effective ELSE NULL END AS effective FROM assessments r JOIN submissions s ON s.id=r.submission_id JOIN attempts a ON a.id=s.attempt_id WHERE r.learner_id=ANY($1::uuid[]) ORDER BY s.submitted_at DESC LIMIT 100`,
        [ids],
      )
    ).rows;
    const sessions = (
      await tx.query(
        "SELECT * FROM study_sessions WHERE learner_id=ANY($1::uuid[]) AND state<>'cancelled' ORDER BY data->>'start'",
        [ids],
      )
    ).rows;
    const exposures = (
      await tx.query(
        "SELECT learner_id,question_id FROM exposure WHERE learner_id=ANY($1::uuid[])",
        [ids],
      )
    ).rows;
    const papers = (await catalogue(tx)).map(
      ({ questions, generalRubric, resources, ...p }) => ({
        ...p,
        questionCount: questions.length,
        exposedLearnerIds: [
          ...new Set(
            exposures
              .filter((e) => questions.some((q) => q.id === e.question_id))
              .map((e) => e.learner_id),
          ),
        ],
        topics: [...new Set(questions.flatMap((q) => q.topics))],
      }),
    );
    const recoveries = (
      await tx.query(
        "SELECT id,attempt_id,learner_id,text,created_at FROM recovered_work WHERE learner_id=ANY($1::uuid[]) ORDER BY created_at DESC LIMIT 20",
        [ids],
      )
    ).rows;
    const wallet =
      role === "parent"
        ? {
            ...(
              await tx.query(
                "SELECT balance FROM funding_accounts WHERE family_id=$1",
                [familyId],
              )
            ).rows[0],
            ledger: (
              await tx.query(
                "SELECT amount,kind,created_at FROM ledger WHERE family_id=$1 ORDER BY created_at DESC LIMIT 50",
                [familyId],
              )
            ).rows,
            reserved: (
              await tx.query(
                "SELECT COALESCE(sum(amount),0) AS amount FROM reservations WHERE family_id=$1 AND released_at IS NULL",
                [familyId],
              )
            ).rows[0].amount,
          }
        : undefined;
    const calendar = (
      await tx.query(
        "SELECT state FROM calendar_connections WHERE user_id=$1",
        [actor.id],
      )
    ).rows[0];
    return {
      role,
      learners,
      enrolments,
      attempts,
      assessments,
      sessions,
      recoveries,
      papers,
      wallet,
      calendar: calendar?.state ?? "disconnected",
    };
  });
}
export async function saveEnrolment(
  actor: Actor,
  familyId: string,
  input: unknown,
) {
  const data = z
    .object({ learnerId: z.string().uuid(), course: Enrolment })
    .parse(input);
  return family(actor, familyId, async (tx) => {
    const who = await learnerAccess(tx, actor, familyId, data.learnerId);
    requireThat(
      who === "student",
      "FORBIDDEN",
      "Students arrange their own courses.",
      403,
    );
    const id = randomUUID();
    await tx.query(
      "INSERT INTO enrolments(id,family_id,learner_id,data) VALUES($1,$2,$3,$4) ON CONFLICT(learner_id,(data->>'subject')) DO UPDATE SET data=EXCLUDED.data",
      [id, familyId, data.learnerId, JSON.stringify(data.course)],
    );
    return { saved: true };
  });
}
export async function removeEnrolment(
  actor: Actor,
  familyId: string,
  input: unknown,
) {
  const data = z
    .object({
      learnerId: z.string().uuid(),
      subject: z.enum(["psychology", "business"]),
    })
    .parse(input);
  return family(actor, familyId, async (tx) => {
    const who = await learnerAccess(tx, actor, familyId, data.learnerId);
    requireThat(
      who === "student",
      "FORBIDDEN",
      "Students arrange their own courses.",
      403,
    );
    const removed = await tx.query(
      `DELETE FROM enrolments
       WHERE family_id=$1 AND learner_id=$2 AND data->>'subject'=$3`,
      [familyId, data.learnerId, data.subject],
    );
    if (!removed.rowCount) throw missing();
    return { removed: true };
  });
}
export async function assessmentDetail(
  actor: Actor,
  familyId: string,
  id: string,
) {
  return family(actor, familyId, async (tx) => {
    const r = (
      await tx.query(
        "SELECT * FROM assessments WHERE id=$1 OR submission_id=$1",
        [id],
      )
    ).rows[0];
    if (!r) throw missing();
    const role = await learnerAccess(tx, actor, familyId, r.learner_id);
    const submission = (
      await tx.query("SELECT * FROM submissions WHERE id=$1", [r.submission_id])
    ).rows[0];
    const attempt = (
      await tx.query("SELECT * FROM attempts WHERE id=$1", [
        submission.attempt_id,
      ])
    ).rows[0];
    const released = role === "teacher" || r.state === "published";
    const questions = attempt.data.questions
      .filter(
        (q: any) =>
          submission.part_key === "all" || submission.part_key === q.id,
      )
      .map((q: any) =>
        released
          ? q
          : { id: q.id, text: q.text, marks: q.marks, number: q.number },
      );
    return {
      ...r,
      candidates: role === "teacher" ? r.candidates : undefined,
      provenance: role === "teacher" ? r.provenance : undefined,
      effective: r.state === "published" ? r.effective : undefined,
      submission,
      questions,
      choiceGroups: attempt.data.choices,
      resources: attempt.data.resources,
      decisions:
        role === "teacher"
          ? (
              await tx.query(
                "SELECT data,created_at FROM review_decisions WHERE assessment_id=$1 ORDER BY created_at",
                [r.id],
              )
            ).rows
          : undefined,
    };
  });
}
export async function familyAction(
  actor: Actor,
  familyId: string,
  input: unknown,
) {
  const data = z
    .discriminatedUnion("action", [
      z.object({
        action: z.literal("cap"),
        learnerId: z.string().uuid(),
        micros: z.number().int().min(0).max(1000000000),
      }),
      z.object({
        action: z.literal("release"),
        learnerId: z.string().uuid(),
        paperId: z.string().uuid(),
      }),
      z.object({ action: z.literal("export") }),
      z.object({
        action: z.literal("delete"),
        confirmation: z.literal("DELETE FAMILY"),
      }),
    ])
    .parse(input);
  return family(actor, familyId, async (tx, role) => {
    if (data.action === "release") {
      const who = await learnerAccess(tx, actor, familyId, data.learnerId);
      requireThat(
        who === "student",
        "FORBIDDEN",
        "Students release their own papers.",
        403,
      );
      await tx.query(
        "INSERT INTO catalogue_releases(family_id,paper_id,released_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [familyId, data.paperId, actor.id],
      );
      return { released: true };
    }
    requireThat(role === "parent", "FORBIDDEN", "Parent access required.", 403);
    if (data.action === "cap") {
      await learnerAccess(tx, actor, familyId, data.learnerId, true);
      await tx.query("UPDATE learners SET monthly_cap=$2 WHERE id=$1", [
        data.learnerId,
        data.micros,
      ]);
    }
    if (data.action === "export") {
      const ids = (
        await tx.query(
          "SELECT id AS learner_id FROM learners WHERE family_id=$1",
          [familyId],
        )
      ).rows.map((r) => r.learner_id);
      const result: Record<string, unknown> = {};
      for (const table of [
        "learners",
        "enrolments",
        "attempts",
        "submissions",
        "assessments",
        "study_sessions",
        "recovered_work",
      ])
        result[table] = (
          await tx.query(
            `SELECT * FROM ${table} WHERE ${table === "learners" ? "id" : "learner_id"}=ANY($1::uuid[])`,
            [ids],
          )
        ).rows;
      await audit(tx, actor.id, "family.exported", {}, familyId);
      return result;
    }
    if (data.action === "delete") {
      const all = (await tx.query("SELECT count(*) FROM learners")).rows[0]
        .count;
      const linked = (
        await tx.query("SELECT count(*) FROM parent_links WHERE user_id=$1", [
          actor.id,
        ])
      ).rows[0].count;
      requireThat(
        Number(all) === Number(linked),
        "FORBIDDEN",
        "Only a parent linked to every learner can request family deletion.",
        403,
      );
      await tx.query("UPDATE families SET deleted_at=now() WHERE id=$1", [
        familyId,
      ]);
    }
    await audit(tx, actor.id, `family.${data.action}`, data, familyId);
    return { saved: true };
  });
}
export async function operatorAction(actor: Actor, input: unknown) {
  await superuser(actor);
  const data = z
    .discriminatedUnion("action", [
      z.object({ action: z.literal("revoke"), id: z.string().uuid() }),
      z.object({
        action: z.literal("suspend"),
        id: z.string().uuid(),
        suspended: z.boolean(),
      }),
      z.object({ action: z.literal("rate"), rate: RateCard }),
      z.object({
        action: z.literal("check"),
        key: z.enum(["merchant_review", "catalogue_permission"]),
        evidence: z.string().min(20),
      }),
      z.object({
        action: z.literal("test_credit"),
        familyId: z.string().uuid(),
        micros: z.number().int().positive().max(25000000),
      }),
      z.object({ action: z.literal("recover_job"), id: z.string().uuid() }),
    ])
    .parse(input);
  return transaction(async (tx) => {
    if (data.action === "recover_job") {
      const job = (
        await tx.query(
          "SELECT * FROM outbox WHERE id=$1 AND (state='failed' OR (state='running' AND locked_at<now()-interval '15 minutes')) FOR UPDATE",
          [data.id],
        )
      ).rows[0];
      requireThat(
        job,
        "JOB_ACTIVE",
        "Only failed or stale jobs can be recovered.",
      );
      if (job.family_id)
        await tx.query("SELECT set_config('app.family_id',$1,true)", [
          job.family_id,
        ]);
      if (job.kind === "mark") {
        const assessment = (
          await tx.query("SELECT * FROM assessments WHERE id=$1 FOR UPDATE", [
            job.data.assessmentId,
          ])
        ).rows[0];
        if (assessment?.state === "marking") {
          const held = Number(assessment.provenance.operatorReservation ?? 0);
          await tx.query(
            "UPDATE operator_budget SET reserved=reserved-$1,spent=spent+$1 WHERE id=1",
            [held],
          );
          await tx.query(
            "UPDATE assessments SET state='failed',error_code='PROCESSING_INTERRUPTED',provenance=provenance||$2::jsonb WHERE id=$1",
            [
              assessment.id,
              JSON.stringify({
                operatorReservation: 0,
                estimatedInterruptedCost: held,
                costReconciliationNeeded: true,
              }),
            ],
          );
          await tx.query(
            "UPDATE outbox SET state='done',last_error='HELD_FOR_PARENT_REVIEW',locked_at=NULL WHERE id=$1",
            [job.id],
          );
        } else
          await tx.query(
            "UPDATE outbox SET state='queued',attempts=0,locked_at=NULL,available_at=now() WHERE id=$1",
            [job.id],
          );
      } else
        await tx.query(
          "UPDATE outbox SET state='queued',attempts=0,locked_at=NULL,available_at=now() WHERE id=$1",
          [job.id],
        );
    }
    if (data.action === "revoke")
      await tx.query(
        "UPDATE invitations SET revoked_at=now() WHERE id=$1 AND accepted_at IS NULL",
        [data.id],
      );
    if (data.action === "suspend")
      await tx.query("UPDATE families SET suspended=$2 WHERE id=$1", [
        data.id,
        data.suspended,
      ]);
    if (data.action === "rate") {
      await tx.query("UPDATE rate_cards SET active=false");
      await tx.query(
        "INSERT INTO rate_cards(id,data,active) VALUES($1,$2,true)",
        [randomUUID(), JSON.stringify(data.rate)],
      );
    }
    if (data.action === "check")
      await tx.query(
        "INSERT INTO operational_checks(key,data) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET data=$2,checked_at=now()",
        [
          data.key,
          JSON.stringify({ evidence: data.evidence, actor: actor.id }),
        ],
      );
    if (data.action === "test_credit") {
      requireThat(
        process.env.PAYMENTS_ENABLED !== "true",
        "TEST_DISABLED",
        "Test credit is disabled when real payments are enabled.",
      );
      await tx.query("SELECT set_config('app.family_id',$1,true)", [
        data.familyId,
      ]);
      await credit(
        tx,
        data.familyId,
        data.micros,
        `test:${randomUUID()}`,
        "operator",
        "test_credit",
      );
    }
    await audit(tx, actor.id, `operator.${data.action}`, data);
    return { saved: true };
  });
}
