import { z } from "zod";
import { testRequestAllowed } from "@/server/testing-config";
import { actor } from "@/server/auth";
import { database, family, enqueue } from "@/server/db";
import { credit, reserve } from "@/server/finance";
import { processJob } from "@/server/jobs";
import { isTestAccount, testFamilyIds } from "@/lib/test-accounts";
import { AppError } from "@/lib/errors";
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
        action: z.enum(["credit", "process"]),
        familyId: z.string().optional(),
        requestId: z.string().uuid(),
      })
      .parse(await request.json());
    const allowedIds = Object.values(testFamilyIds);
    const memberships = (
      await database().query(
        "SELECT family_id,role FROM memberships WHERE user_id=$1 AND active AND family_id=ANY($2::uuid[])",
        [user.id, allowedIds],
      )
    ).rows;
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
        const waiting = (
          await tx.query(
            "SELECT r.id,a.data->>'quoteId' AS quote FROM assessments r JOIN submissions s ON s.id=r.submission_id JOIN attempts a ON a.id=s.attempt_id WHERE r.state='awaiting_funds' AND r.family_id=$1",
            [member.family_id],
          )
        ).rows;
        for (const assessment of waiting) {
          await reserve(tx, assessment.quote, true);
          await tx.query("UPDATE assessments SET state='queued' WHERE id=$1", [
            assessment.id,
          ]);
          await enqueue(
            tx,
            "mark",
            `ux-funded:${assessment.id}:${body.requestId}`,
            { assessmentId: assessment.id },
            member.family_id,
          );
        }
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
