import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Enrolment } from "../lib/contracts";
import { family, learnerAccess, enqueue, type Actor } from "./db";
import { requireThat, missing } from "../lib/errors";
import { createAttemptInTransaction } from "./learning";
// Convert a wall time to an instant by matching Intl's IANA-zone rendering. Reject nonexistent DST times.
export function zonedInstant(date: string, time: string, timezone: string) {
  const target = `${date}T${time}`;
  const guess = new Date(`${target}:00Z`).getTime();
  const format = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const d = new Date(guess + offset * 60000);
    if (format.format(d).replace(" ", "T") === target) return d.toISOString();
  }
  return null;
}
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
    await learnerAccess(tx, actor, familyId, learnerId);
    const row = (
      await tx.query("SELECT * FROM enrolments WHERE id=$1 AND learner_id=$2", [
        enrolmentId,
        learnerId,
      ])
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
      "UPDATE study_sessions SET state='cancelled' WHERE learner_id=$1 AND state='proposed'",
      [learnerId],
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
    const row = (
      await tx.query("SELECT * FROM study_sessions WHERE id=$1 FOR UPDATE", [
        data.id,
      ])
    ).rows[0];
    if (!row) throw missing();
    const role = await learnerAccess(tx, actor, familyId, row.learner_id);
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
