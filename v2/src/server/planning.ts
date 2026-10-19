import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Enrolment } from "../lib/contracts";
import { family, learnerAccess, enqueue, type Actor } from "./db";
import { requireThat, missing } from "../lib/errors";
import { createAttemptInTransaction } from "./learning";
import { zonedInstant } from "../lib/time";
export { zonedInstant } from "../lib/time";
export async function proposePlan(
  actor: Actor,
  familyId: string,
  input: unknown,
) {
  const { learnerId, enrolmentId, week } = z
    .object({
      learnerId: z.string().uuid(),
      enrolmentId: z.string().uuid(),
      week: z.string().date(),
    })
    .parse(input);
  return family(actor, familyId, async (tx) => {
    const role = await learnerAccess(tx, actor, familyId, learnerId);
    requireThat(
      role === "student",
      "FORBIDDEN",
      "Students arrange their own plan.",
      403,
    );
    const row = (
      await tx.query(
        "SELECT * FROM enrolments WHERE id=$1 AND learner_id=$2 FOR UPDATE",
        [enrolmentId, learnerId],
      )
    ).rows[0];
    if (!row) throw missing();
    const course = Enrolment.parse(row.data);
    const due = (
      await tx.query(
        "SELECT DISTINCT topic FROM corrective_tasks WHERE learner_id=$1 AND completed_at IS NULL ORDER BY topic",
        [learnerId],
      )
    ).rows.map((r) => r.topic);
    const topics = [...new Set([...due, ...course.taughtTopics])];
    requireThat(
      topics.length,
      "TOPICS",
      "Add taught topics before creating a plan.",
    );
    await tx.query(
      "UPDATE study_sessions SET state='cancelled' WHERE learner_id=$1 AND state='proposed' AND data->>'enrolmentId'=$2 AND COALESCE(data->>'origin','suggested')<>'manual' AND substring(data->>'start',1,10) BETWEEN $3 AND $4",
      [
        learnerId,
        enrolmentId,
        week,
        new Date(new Date(week + "T12:00:00Z").getTime() + 6 * 86400000)
          .toISOString()
          .slice(0, 10),
      ],
    );
    const ids = [];
    let index = 0;
    for (let day = 0; day < 7; day++) {
      const date = new Date(`${week}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + day);
      const stamp = date.toISOString().slice(0, 10);
      if (course.blockedDates.includes(stamp)) continue;
      for (const slot of course.availability.filter(
        (a) => a.day === date.getUTCDay(),
      )) {
        const start = zonedInstant(stamp, slot.start, course.timezone);
        if (!start || new Date(start) <= new Date()) continue;
        const topic = topics[index++ % topics.length],
          id = randomUUID();
        const data = {
          title: `${course.subject === "business" ? "Business" : "Psychology"} · ${topic}`,
          topic,
          enrolmentId,
          minutes: Math.min(slot.minutes, course.sessionMinutes),
          start,
          timezone: course.timezone,
          purpose: due.includes(topic)
            ? "Independent retrieval of a previously practised topic"
            : "Practise taught material",
          mode: "independent",
          origin: "suggested",
        };
        await tx.query(
          "INSERT INTO study_sessions(id,family_id,learner_id,data) VALUES($1,$2,$3,$4)",
          [id, familyId, learnerId, JSON.stringify(data)],
        );
        ids.push(id);
      }
    }
    return { ids };
  });
}
export async function planAction(
  actor: Actor,
  familyId: string,
  input: unknown,
) {
  const data = z
    .object({
      id: z.string().uuid(),
      action: z.enum(["approve", "cancel", "reschedule", "publish"]),
      start: z.string().datetime().optional(),
    })
    .parse(input);
  return family(actor, familyId, async (tx) => {
    let row = (
      await tx.query("SELECT * FROM study_sessions WHERE id=$1", [data.id])
    ).rows[0];
    if (!row) throw missing();
    const role = await learnerAccess(tx, actor, familyId, row.learner_id);
    requireThat(
      role === "student",
      "FORBIDDEN",
      "Students arrange their own plan.",
      403,
    );
    const attempt = row.data.attemptId
      ? (
          await tx.query("SELECT state FROM attempts WHERE id=$1 FOR UPDATE", [
            row.data.attemptId,
          ])
        ).rows[0]
      : null;
    const initialAttempt = row.data.attemptId;
    row = (
      await tx.query("SELECT * FROM study_sessions WHERE id=$1 FOR UPDATE", [
        data.id,
      ])
    ).rows[0];
    requireThat(
      row && row.data.attemptId === initialAttempt,
      "PLAN_CHANGED",
      "This session changed. Refresh your diary before editing.",
    );
    if (data.action === "cancel" && row.state === "cancelled")
      return { id: row.id };
    if (["cancel", "reschedule", "approve"].includes(data.action))
      requireThat(
        ["proposed", "approved"].includes(row.state) &&
          (!initialAttempt || attempt?.state === "draft"),
        "PLAN_STARTED",
        "This session has already started or finished. Its test and deadline cannot be changed.",
      );
    if (data.action === "approve") {
      requireThat(
        role === "student",
        "STUDENT_APPROVAL",
        "The student approves their study plan.",
      );
      requireThat(
        ["proposed", "approved"].includes(row.state),
        "PLAN_STATE",
        "This session can no longer be approved.",
      );
      const attemptId =
        row.data.attemptId ??
        (
          await createAttemptInTransaction(tx, actor, familyId, {
            learnerId: row.learner_id,
            enrolmentId: row.data.enrolmentId,
            mode: row.data.mode,
            topic: row.data.topic,
          })
        ).id;
      await tx.query(
        "UPDATE study_sessions SET state='approved',data=jsonb_set(data,'{attemptId}',to_jsonb($2::text)) WHERE id=$1",
        [row.id, attemptId],
      );
    }
    if (data.action === "cancel")
      await tx.query(
        "UPDATE study_sessions SET state='cancelled' WHERE id=$1",
        [row.id],
      );
    if (data.action === "reschedule") {
      requireThat(
        data.start && row.state !== "completed",
        "DATE",
        "Choose a new time for an unfinished session.",
      );
      requireThat(
        new Date(data.start!) > new Date(),
        "DATE",
        "Choose a future time.",
      );
      await tx.query(
        "UPDATE study_sessions SET data=jsonb_set(data,'{start}',to_jsonb($2::text)),state='proposed' WHERE id=$1",
        [row.id, data.start],
      );
      if (row.calendar_event_id)
        await enqueue(
          tx,
          "calendar",
          `calendar:reschedule:${row.id}:${randomUUID()}`,
          { sessionId: row.id, userId: actor.id },
          familyId,
        );
    }
    if (
      data.action === "publish" ||
      data.action === "approve" ||
      data.action === "cancel"
    )
      await enqueue(
        tx,
        "calendar",
        `calendar:${row.id}:${randomUUID()}`,
        { sessionId: row.id, userId: actor.id },
        familyId,
      );
    return { id: row.id };
  });
}

export async function createSession(
  actor: Actor,
  familyId: string,
  input: unknown,
) {
  const value = z
    .object({
      id: z.string().uuid(),
      learnerId: z.string().uuid(),
      enrolmentId: z.string().uuid(),
      topic: z.string().min(1),
      date: z.string().date(),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      minutes: z.number().int().min(5).max(180),
    })
    .parse(input);
  return family(actor, familyId, async (tx) => {
    requireThat(
      (await learnerAccess(tx, actor, familyId, value.learnerId)) === "student",
      "FORBIDDEN",
      "Students arrange their own diary.",
      403,
    );
    const row = (
      await tx.query(
        "SELECT * FROM enrolments WHERE id=$1 AND learner_id=$2 FOR UPDATE",
        [value.enrolmentId, value.learnerId],
      )
    ).rows[0];
    if (!row) throw missing();
    const course = Enrolment.parse(row.data);
    requireThat(
      !course.blockedDates.includes(value.date),
      "DATE",
      "This date is marked as unavailable. Choose another date or update your routine.",
    );

    requireThat(
      course.taughtTopics.includes(value.topic),
      "TOPIC",
      "Choose a topic you have been taught.",
    );
    const start = zonedInstant(value.date, value.time, course.timezone);
    requireThat(
      start && new Date(start) > new Date(),
      "DATE",
      "Choose an available future time in the course timezone.",
    );
    const previous = (
      await tx.query(
        "SELECT family_id,learner_id,data FROM study_sessions WHERE id=$1",
        [value.id],
      )
    ).rows[0];
    if (previous) {
      requireThat(
        previous.family_id === familyId &&
          previous.learner_id === value.learnerId &&
          previous.data.enrolmentId === value.enrolmentId,
        "CONFLICT",
        "This session request has already been used.",
      );
      return { id: value.id };
    }
    await tx.query(
      "INSERT INTO study_sessions(id,family_id,learner_id,data) VALUES($1,$2,$3,$4)",
      [
        value.id,
        familyId,
        value.learnerId,
        JSON.stringify({
          title: `${course.subject === "business" ? "Business" : "Psychology"} · ${value.topic}`,
          enrolmentId: row.id,
          topic: value.topic,
          minutes: value.minutes,
          start,
          timezone: course.timezone,
          purpose: "A study session you planned",
          mode: "independent",
          origin: "manual",
        }),
      ],
    );
    return { id: value.id };
  });
}

export async function updatePlanning(
  actor: Actor,
  familyId: string,
  input: unknown,
) {
  const value = z
    .object({
      id: z.string().uuid(),
      learnerId: z.string().uuid(),
      patch: Enrolment.pick({
        taughtTopics: true,
        availability: true,
        blockedDates: true,
        sessionMinutes: true,
        examDates: true,
        timezone: true,
      })
        .partial()
        .strict(),
    })
    .parse(input);
  return family(actor, familyId, async (tx) => {
    requireThat(
      (await learnerAccess(tx, actor, familyId, value.learnerId)) === "student",
      "FORBIDDEN",
      "Students arrange their own diary.",
      403,
    );
    const row = (
      await tx.query(
        "SELECT * FROM enrolments WHERE id=$1 AND learner_id=$2 FOR UPDATE",
        [value.id, value.learnerId],
      )
    ).rows[0];
    if (!row) throw missing();
    const data = Enrolment.parse({ ...row.data, ...value.patch });
    requireThat(
      new Set(data.examDates.map((e) => e.unit.trim())).size ===
        data.examDates.length &&
        data.examDates.every((e) => e.unit.trim().length > 0),
      "EXAMS",
      "Give each exam a different unit.",
    );
    requireThat(
      data.availability.every(
        (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s.start) && s.minutes <= 180,
      ),
      "TIME",
      "Choose a valid start time and a duration up to 180 minutes.",
    );
    await tx.query("UPDATE enrolments SET data=$2 WHERE id=$1", [
      row.id,
      JSON.stringify(data),
    ]);
    if (value.patch.examDates || value.patch.timezone)
      await enqueue(
        tx,
        "calendar_exams",
        `exams:${row.id}:${randomUUID()}`,
        {
          enrolmentId: row.id,
          learnerId: value.learnerId,
          previousUnits: (row.data.examDates ?? []).map((e: any) => e.unit),
          userId: actor.id,
        },
        familyId,
      );
    return { saved: true };
  });
}
