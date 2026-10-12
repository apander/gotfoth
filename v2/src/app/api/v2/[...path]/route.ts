import { randomUUID } from "node:crypto";
import { z } from "zod";
import { actor } from "@/server/auth";
import { AppError, requireThat } from "@/lib/errors";
import {
  identity,
  snapshot,
  saveEnrolment,
  assessmentDetail,
  familyAction,
  operatorAction,
} from "@/server/application";
import {
  saveFamily,
  invite,
  acceptInvitation,
  adminSnapshot,
  catalogueAction,
  setMember,
  sendWelcome,
  reissueInvite,
} from "@/server/admin";
import {
  createAttempt,
  getAttempt,
  attemptAction,
  topicHistory,
} from "@/server/learning";
import { review } from "@/server/marking";
import { checkout, calendarConnect } from "@/server/integrations";
import { proposePlan, planAction } from "@/server/planning";
import { database } from "@/server/db";
import {
  examPaper,
  examQuestion,
  listExamPapers,
  publishExamPaper,
  reviewExamQuestion,
  setExamPermission,
  setExamTopic,
} from "@/server/exam-papers";
export const runtime = "nodejs";
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const requestId = randomUUID();
  try {
    const url = new URL(request.url),
      path = (await context.params).path.join("/");
    if (request.method === "POST") {
      requireThat(
        request.headers.get("origin") === url.origin,
        "ORIGIN",
        "Request origin could not be verified.",
        403,
      );
      requireThat(
        Number(request.headers.get("content-length") ?? 0) < 2_000_000,
        "SIZE",
        "Request is too large.",
        413,
      );
    }
    const user = await actor();
    const body = request.method === "POST" ? await request.json() : {};
    const familyId = url.searchParams.get("family") ?? body.familyId;
    if (path.startsWith("family/")) z.string().uuid().parse(familyId);
    let result: unknown;
    if (request.method === "GET") {
      if (path === "identity") result = await identity(user);
      else if (path === "admin") result = await adminSnapshot(user);
      else if (path === "family/snapshot")
        result = await snapshot(user, familyId);
      else if (path === "family/attempt")
        result = await getAttempt(
          user,
          familyId,
          z.string().uuid().parse(url.searchParams.get("id")),
        );
      else if (path === "family/assessment")
        result = await assessmentDetail(
          user,
          familyId,
          z.string().uuid().parse(url.searchParams.get("id")),
        );
      else if (path === "family/exam-papers") result = await listExamPapers(user);
      else if (path === "family/exam-paper")
        result = await examPaper(user, z.string().uuid().parse(url.searchParams.get("id")));
      else if (path === "family/exam-question")
        result = await examQuestion(user, z.string().min(3).parse(url.searchParams.get("id")));
      else
        throw new AppError("NOT_FOUND", "This endpoint is unavailable.", 404);
    } else {
      if (path === "invitation/accept")
        result = await acceptInvitation(
          user,
          z.string().min(20).max(100).parse(body.token),
        );
      else if (path === "admin/family") result = await saveFamily(user, body);
      else if (path === "admin/invite") result = await invite(user, body);
      else if (path === "admin/member") result = await setMember(user, body);
      else if (path === "admin/welcome") result = await sendWelcome(user, body);
      else if (path === "admin/reissue") result = await reissueInvite(user, body);
      else if (path === "admin/catalogue")
        result = await catalogueAction(user, body);
      else if (path === "admin/operation")
        result = await operatorAction(user, body);
      else if (path === "family/enrolment")
        result = await saveEnrolment(user, familyId, body);
      else if (path === "family/attempt/create")
        result = await createAttempt(user, familyId, body);
      else if (path === "family/attempt/action")
        result = await attemptAction(
          user,
          familyId,
          z.string().uuid().parse(body.id),
          body,
        );
      else if (path === "family/history")
        result = await topicHistory(user, familyId, body);
      else if (path === "family/review")
        result = await review(user, familyId, body);
      else if (path === "family/action")
        result = await familyAction(user, familyId, body);
      else if (path === "family/checkout")
        result = await checkout(user, familyId, body);
      else if (path === "family/plan/propose")
        result = await proposePlan(user, familyId, body);
      else if (path === "family/plan/action")
        result = await planAction(user, familyId, body);
      else if (path === "family/exam-review")
        result = await reviewExamQuestion(
          user,
          z
            .object({
              revisionId: z.string().uuid(),
              paperId: z.string().uuid(),
              decision: z.enum(["accept", "reject"]),
              note: z.string().max(2000).default(""),
            })
            .parse(body),
        );
      else if (path === "family/exam-topic")
        result = await setExamTopic(
          user,
          z
            .object({
              questionId: z.string().min(3),
              topicId: z.string().uuid(),
              confirmed: z.boolean(),
            })
            .parse(body),
        );
      else if (path === "family/exam-permission")
        result = await setExamPermission(
          user,
          z.string().uuid().parse(body.paperId),
          z.boolean().parse(body.confirmed),
        );
      else if (path === "family/exam-publish")
        result = await publishExamPaper(user, z.string().uuid().parse(body.paperId));
      else if (path === "calendar/connect")
        result = await calendarConnect(user);
      else if (path === "calendar/disconnect") {
        await database().query(
          "UPDATE calendar_connections SET state='disconnected',encrypted_token='' WHERE user_id=$1",
          [user.id],
        );
        result = { disconnected: true };
      } else
        throw new AppError("NOT_FOUND", "This endpoint is unavailable.", 404);
    }
    return Response.json(result, {
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  } catch (error) {
    const known = error instanceof AppError;
    const invalid = error instanceof z.ZodError;
    return Response.json(
      {
        error: {
          code: known ? error.code : invalid ? "VALIDATION" : "INTERNAL",
          message: known
            ? error.message
            : invalid
              ? "Please check the supplied fields."
              : "The request could not be completed. Your saved work is safe.",
          requestId,
        },
      },
      { status: known ? error.status : invalid ? 400 : 500 },
    );
  }
}
export const GET = handle;
export const POST = handle;
