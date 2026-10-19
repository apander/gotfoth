import { database, transaction } from "./db";
import { freeze } from "./learning";
import { runMarking } from "./marking";
import { publishCalendar, publishExamCalendar } from "./integrations";
export async function processJob(id: string) {
  const job = await transaction(async (tx) => {
    const r = (
      await tx.query(
        "SELECT * FROM outbox WHERE id=$1 AND state='queued' AND available_at<=now() FOR UPDATE SKIP LOCKED",
        [id],
      )
    ).rows[0];
    if (!r) return null;
    if (r.family_id) {
      const allowed = (
        await tx.query(
          "SELECT id FROM families WHERE id=$1 AND NOT suspended AND deleted_at IS NULL",
          [r.family_id],
        )
      ).rows.length;
      if (!allowed) {
        await tx.query(
          "UPDATE outbox SET state='cancelled',last_error='WORKSPACE_INACTIVE' WHERE id=$1",
          [id],
        );
        return null;
      }
    }
    await tx.query(
      "UPDATE outbox SET state='running',locked_at=now(),attempts=attempts+1 WHERE id=$1",
      [id],
    );
    return r;
  });
  if (!job) return;
  try {
    if (job.kind === "deadline")
      await transaction(async (tx) => {
        const a = (
          await tx.query(
            "SELECT * FROM attempts WHERE id=$1 AND state='in_progress' AND deadline<=now() FOR UPDATE",
            [job.data.attemptId],
          )
        ).rows[0];
        if (a) await freeze(tx, a, "deadline");
      }, job.family_id);
    else if (job.kind === "mark")
      await runMarking(job.family_id, job.data.assessmentId);
    else if (job.kind === "calendar")
      await publishCalendar(job.data.userId, job.family_id, job.data.sessionId);
    else if (job.kind === "calendar_exams")
      await publishExamCalendar(
        job.data.userId,
        job.family_id,
        job.data.enrolmentId,
        job.data.learnerId,
        job.data.previousUnits ?? [],
      );
    else throw new Error("UNKNOWN_JOB");
    await database().query(
      "UPDATE outbox SET state='done',locked_at=NULL WHERE id=$1",
      [id],
    );
    if (job.kind === "mark")
      return (
        await database().query(
          "SELECT id FROM outbox WHERE kind='mark' AND state='queued' AND family_id=$1 AND data->>'assessmentId'=$2 ORDER BY created_at LIMIT 1",
          [job.family_id, job.data.assessmentId],
        )
      ).rows[0]?.id as string | undefined;
  } catch (error) {
    await database().query(
      "UPDATE outbox SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,locked_at=NULL,available_at=now()+interval '1 minute',last_error=$2 WHERE id=$1",
      [
        id,
        error instanceof Error && "code" in error
          ? String(error.code)
          : "PROCESSING_FAILED",
      ],
    );
  }
}
export async function pendingJobs() {
  // Expiry jobs are only claimed after their deadline. New marking jobs stay independently dispatchable.
  await database().query(
    "UPDATE outbox SET available_at=GREATEST(available_at,created_at+((data->>'delaySeconds')::int*interval '1 second')) WHERE kind='deadline' AND state='queued'",
  );
  return (
    await database().query(
      "SELECT id FROM outbox WHERE state='queued' AND available_at<=now() ORDER BY created_at LIMIT 20",
    )
  ).rows;
}
