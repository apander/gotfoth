import { test, expect } from "@playwright/test";
test("student can navigate topic evidence and submit typed practice through the interface", async ({
  page,
}) => {
  const family = "10000000-0000-4000-8000-000000000001",
    learner = "10000000-0000-4000-8000-000000000002",
    enrolment = "10000000-0000-4000-8000-000000000003",
    attemptId = "10000000-0000-4000-8000-000000000004";
  let text = "",
    revision = 0,
    state = "draft",
    submitted = false;
  const question = {
    id: "q1",
    number: "1",
    text: "Explain one limitation of a small sample.",
    marks: 4,
    format: "essay",
    resourceIds: [],
    topics: ["research.methods"],
    hints: [],
  };
  await page.route("**/api/v2/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    let result: any = {};
    if (path.endsWith("/identity"))
      result = {
        user: { id: "student", email: "student@example.test" },
        superuser: false,
        workspaces: [{ id: family, name: "Test family", role: "student" }],
      };
    else if (path.endsWith("/snapshot"))
      result = {
        role: "student",
        learners: [{ id: learner, name: "Alex" }],
        enrolments: [
          {
            id: enrolment,
            learner_id: learner,
            data: {
              subject: "psychology",
              specification: "2026",
              targetSession: "June 2027",
              taughtTopics: ["research.methods"],
            },
          },
        ],
        attempts: [],
        assessments: [],
        sessions: [],
        papers: [],
        calendar: "disconnected",
      };
    else if (path.endsWith("/motivation"))
      result = {
        goal: 3,
        timezone: "UTC",
        weekly: 0,
        total: 0,
        milestones: [],
      };
    else if (path.endsWith("/activity"))
      result = {
        items: [
          {
            id: "published",
            state: "published",
            subject: "psychology",
            mode: "independent",
            submitted_at: "2026-10-18T12:00:00Z",
            effective: [{ awarded: 7, available: 10 }],
          },
        ],
        total: 1,
        offset: 0,
        limit: 25,
      };
    else if (path.endsWith("/history"))
      result = [
        {
          submissionId: "10000000-0000-4000-8000-000000000009",
          submittedAt: new Date().toISOString(),
          awarded: 7,
          available: 10,
          percentage: 70,
          questionCount: 2,
          mixed: true,
          evidence: [{ mode: "independent", assisted: false, seen: true }],
        },
      ];
    else if (path.endsWith("/attempt/create")) result = { id: attemptId };
    else if (path.endsWith("/attempt"))
      result = {
        id: attemptId,
        mode: "guided",
        state,
        deadline: null,
        data: {
          questions: [question],
          resources: [],
          choices: [],
          selected: [],
          instructions: "Answer the question.",
          durationMinutes: 10,
          extraTimePercent: 0,
        },
        answers: [{ question_id: "q1", text, revision, flagged: false }],
        serverNow: new Date().toISOString(),
      };
    else if (path.endsWith("/attempt/action")) {
      const body = route.request().postDataJSON();
      if (body.action === "quote")
        result = {
          id: "10000000-0000-4000-8000-000000000005",
          maxChargeMicros: 100000,
        };
      if (body.action === "start") {
        state = "in_progress";
        result = { editorToken: "test-editor" };
      }
      if (body.action === "save") {
        expect(body.revision).toBe(revision);
        text = body.text;
        result = { revision: ++revision };
      }
      if (body.action === "submit") {
        expect(text).toBe(
          "A small sample may not represent the wider population.",
        );
        submitted = true;
        result = { submission: "10000000-0000-4000-8000-000000000006" };
      }
    }
    await route.fulfill({ json: result });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Your next step/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/today-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Results over time" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Topic trends", exact: true }).click();
  await expect(page.getByRole("cell", { name: "7/10 (70%)" })).toBeVisible();
  await expect(page.getByText(/mixed-topic evidence/)).toBeVisible();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: "Start practice" }).first().click();
  await page
    .getByRole("button", { name: "Start practice →", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your answer", exact: true })
    .fill("A small sample may not represent the wider population.");
  await expect(page.getByRole("status")).toHaveText("Saved to account");
  await page.getByRole("button", { name: "Review before submitting" }).click();
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect.poll(() => submitted).toBe(true);
});
test("invite-only landing is accessible at desktop and mobile widths", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good to see you." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Continue with Google/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Invitation only.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/login-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/login-mobile.png",
    fullPage: true,
  });
  const unauthorised = await page.request.get(
    "/api/source/00000000-0000-0000-0000-000000000000",
  );
  expect(unauthorised.status()).toBe(404);
  const cron = await page.request.get("/api/cron");
  expect(cron.status()).toBe(401);
});
