import { z } from "zod";
import { testRequestAllowed } from "@/server/testing-config";
import { actor } from "@/server/auth";
import { database, family } from "@/server/db";
import { credit } from "@/server/finance";
import { processJob } from "@/server/jobs";
import { isTestAccount, testFamilyIds } from "@/lib/test-accounts";
import { AppError } from "@/lib/errors";
import { createAttemptInTransaction } from "@/server/learning";
import { fixtureId } from "@/server/test-fixtures";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return testRequestAllowed(request)
    ? Response.json(
        { enabled: true },
        { headers: { "cache-control": "no-store" } },
      )
    : new Response(null, { status: 404 });
}
export async function POST(request: Request) {
  if (!testRequestAllowed(request)) return new Response(null, { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "Request origin could not be verified." },
      { status: 403 },
    );
  try {
    const user = await actor();
    if (!isTestAccount(user.email) || !user.id.startsWith("ux-fixture-"))
      return Response.json(
        { error: "A fixture test account is required." },
        { status: 403 },
      );
    const body = z
      .object({
        action: z.enum(["credit", "process", "exam"]),
        subject: z.enum(["psychology", "business"]).default("psychology"),
        familyId: z.string().optional(),
        requestId: z.string().uuid(),
      })
      .parse(await request.json());
    const allowedIds = Object.values(testFamilyIds);
    const memberships = (
      await database().query(
        "SELECT family_id,role,learner_id FROM memberships WHERE user_id=$1 AND active AND family_id=ANY($2::uuid[])",
        [user.id, allowedIds],
      )
    ).rows;
    if (body.action === "exam") {
      const member = memberships.find(
        (m) =>
          m.role === "student" &&
          (!body.familyId || m.family_id === body.familyId),
      );
      if (!member)
        throw new AppError(
          "FORBIDDEN",
          "A test student membership is required.",
          403,
        );
      const result = await family(user, member.family_id, async (tx, role) => {
        if (role !== "student")
          throw new AppError("FORBIDDEN", "Student membership required.", 403);
        const enrolment = (
          await tx.query(
            "SELECT id FROM enrolments WHERE learner_id=$1 AND data->>'subject'=$2",
            [member.learner_id, body.subject],
          )
        ).rows[0];
        if (!enrolment)
          throw new AppError(
            "COURSE_REQUIRED",
            "Set up this subject first, or choose Alex for the psychology example.",
          );
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `ux-exam:${user.id}:${body.requestId}`,
        ]);
        const existing = (
          await tx.query(
            "SELECT id FROM attempts WHERE learner_id=$1 AND data->>'exampleRequest'=$2",
            [member.learner_id, body.requestId],
          )
        ).rows[0];
        if (existing) return existing;
        const created = await createAttemptInTransaction(
          tx,
          user,
          member.family_id,
          {
            learnerId: member.learner_id,
            enrolmentId: enrolment.id,
            mode: "mock",
            paperId: fixtureId(`exam-paper-${body.subject}`),
          },
        );
        await tx.query(
          "UPDATE attempts SET data=jsonb_set(data,'{exampleRequest}',to_jsonb($2::text)) WHERE id=$1",
          [created.id, body.requestId],
        );
        return created;
      });
      return Response.json({
        url: `/?family=${member.family_id}&attempt=${result.id}`,
      });
    }
    if (body.action === "credit") {
      const member = memberships.find(
        (m) => m.family_id === body.familyId && m.role === "parent",
      );
      if (!member)
        return Response.json(
          { error: "Parent membership of a test family is required." },
          { status: 403 },
        );
      await family(user, member.family_id, async (tx, role) => {
        if (role !== "parent") throw new Error("Parent membership required.");
        await credit(
          tx,
          member.family_id,
          10000000,
          `ux-credit:${user.id}:${body.requestId}`,
          "UX fixture credit",
          "test_credit",
        );
      });
      return Response.json({
        message: "€10 test credit added. No payment was taken.",
      });
    }
    let count = 0;
    for (const member of memberships) {
      await family(user, member.family_id, async (tx) => {
        await tx.query("SELECT 1");
      });
      const jobs = (
        await database().query(
          "SELECT id FROM outbox WHERE family_id=$1 AND kind IN ('mark','deadline') AND state='queued' AND available_at<=now() ORDER BY created_at LIMIT 15",
          [member.family_id],
        )
      ).rows;
      for (const job of jobs) {
        let next: string | undefined = job.id;
        for (let step = 0; next && step < 12; step++) {
          next = await processJob(next);
          count++;
        }
      }
    }
    return Response.json({
      message: count
        ? `Processed ${count} test workflow steps. Open Reviews or refresh progress to see the result.`
        : "No test submissions are waiting for processing.",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof AppError
            ? error.message
            : error instanceof z.ZodError
              ? "Check the test action."
              : "The test action could not complete.",
      },
      { status: error instanceof AppError ? error.status : 400 },
    );
  }
}
