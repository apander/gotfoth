import { test, expect, type Page } from "@playwright/test";
const family = "10000000-0000-4000-8000-000000000001",
  learner = "10000000-0000-4000-8000-000000000002",
  attempt = "10000000-0000-4000-8000-000000000003";
const course = {
  id: "course",
  learner_id: learner,
  data: {
    subject: "psychology",
    specification: "2026",
    targetSession: "June 2027",
    taughtTopics: ["research.methods", "clinical.psychology"],
    timezone: "Europe/Amsterdam",
    availability: [],
    examDates: [],
  },
};
const questions = [
  {
    id: "q1",
    number: "1(a)",
    text: "Explain one limitation of using a small sample when investigating mental health treatments.",
    marks: 4,
    topics: ["research.methods"],
    resourceIds: [],
    format: "essay",
  },
  {
    id: "q2",
    number: "1(b)",
    text: "Evaluate the use of interviews in clinical psychology.",
    marks: 8,
    topics: ["clinical.psychology"],
    resourceIds: [],
    format: "essay",
  },
];
const results = [
  {
    questionId: "q1",
    awarded: 2,
    available: 4,
    achievements: ["Identifies the issue of representativeness."],
    improvement: "Explain how a biased sample limits generalisation.",
    justification: "The effect on generalisation needs development.",
    evidence: [],
  },
  {
    questionId: "q2",
    awarded: 6,
    available: 8,
    achievements: ["Balances strengths and limitations."],
    improvement: "Link your evaluation to reliability.",
    justification: "Two evaluation points need supporting evidence.",
    evidence: [],
  },
];
async function fixture(
  page: Page,
  persona: "student" | "parent" | "teacher" | "superuser" = "student",
  empty = false,
  extraCourse = false,
  courseOverride?: any,
  fundingScenario?: "waiting" | "low",
) {
  let revision = 0;
  let goal = 3;
  let configured = !empty;
  const parent = persona === "parent",
    admin = persona === "superuser";
  await page.addInitScript(
    ({ attempt }) => {
      sessionStorage.setItem(`sv-editor:${attempt}`, "editor");
    },
    { attempt },
  );
  await page.route("**/api/v2/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: any = {};
    if (path.endsWith("/identity"))
      json = {
        user: { id: "test", name: "Alex Morgan", email: "test@example.test" },
        superuser: admin,
        workspaces: [
          {
            id: family,
            name: "River family",
            role: persona,
          },
        ],
      };
    else if (
      ["/snapshot", "/summary", "/funding"].some((p) => path.endsWith(p))
    )
      json = {
        role: persona,
        learners: [{ id: learner, name: "Alex", monthly_cap: 10000000 }],
        enrolments: configured
          ? [
              courseOverride ?? course,
              ...(extraCourse
                ? [
                    {
                      ...course,
                      id: "business-course",
                      data: { ...course.data, subject: "business" },
                    },
                  ]
                : []),
            ]
          : [],
        attempts: empty
          ? []
          : [
              {
                id: attempt,
                learner_id: learner,
                subject: "psychology",
                mode: "independent",
                state: "in_progress",
                created_at: "2026-10-05T17:00:00Z",
              },
            ],
        assessments: empty
          ? []
          : [
              {
                id: "assessment",
                learner_id: learner,
                state:
                  fundingScenario === "waiting"
                    ? "awaiting_funds"
                    : "published",
                mode: "independent",
                subject: "psychology",
                submitted_at: "2026-10-04T17:00:00Z",
                effective: results,
              },
            ],
        papers: [
          {
            id: "paper",
            fullMockEligible: true,
            topics: ["research.methods", "clinical.psychology"],
            subject: "psychology",
            compatibleSpecifications: ["2026"],
            year: 2025,
            session: "June",
            unit: "WPS04/01",
            title: "Clinical psychology and psychological skills",
            durationMinutes: 120,
            totalMarks: 96,
            exposedLearnerIds: [],
          },
        ],
        sessions: [],
        calendar: "disconnected",
        wallet: {
          balance: fundingScenario ? 500000 : 10000000,
          reserved: 0,
          ledger: [],
          awaiting:
            fundingScenario === "waiting"
              ? [
                  {
                    id: "waiting",
                    name: "Alex",
                    subject: "psychology",
                    max_charge: 1000000,
                    remaining_cap: 0,
                  },
                ]
              : [],
        },
      };
    else if (path.endsWith("/enrolment")) {
      configured = true;
      json = { saved: true };
    } else if (path.endsWith("/attempt/create")) json = { id: attempt };
    else if (path.endsWith("/motivation")) {
      if (route.request().method() === "POST")
        goal = route.request().postDataJSON().goal;
      json = {
        goal,
        timezone: "Europe/Amsterdam",
        total: 5,
        weekly: 2,
        week: "2026-10-12",
        latestAttemptId: "completed",
        milestones: [1, 5],
      };
    } else if (path.endsWith("/teacher/groups")) json = { groups: [] };
    else if (path.endsWith("/activity"))
      json = {
        items: [
          {
            id: "assessment",
            learner_id: learner,
            subject: "psychology",
            mode: "independent",
            state: "published",
            effective: results,
            submitted_at: "2026-10-04T17:00:00Z",
          },
        ],
        total: 1,
        offset: 0,
        limit: 25,
      };
    else if (path.endsWith("/teacher/workspace")) {
      const params = new URL(route.request().url()).searchParams;
      const students = [
        {
          id: learner,
          name: "Alex",
          family_id: family,
          family_name: "River family",
          courses: [course.data],
          pending: 2,
        },
        {
          id: "second",
          name: "Sam",
          family_id: "20000000-0000-4000-8000-000000000001",
          family_name: "Hill family",
          courses: [{ ...course.data, subject: "business" }],
          pending: 1,
        },
      ];
      const reviews = [
        {
          id: "older-review",
          learner_id: learner,
          learner_name: "Alex",
          family_id: family,
          family_name: "River family",
          state: "needs_review",
          subject: "psychology",
          submitted_at: "2026-10-01T10:00:00Z",
          mode: "independent",
        },
        {
          id: "waiting",
          learner_id: learner,
          learner_name: "Alex",
          family_id: family,
          family_name: "River family",
          state: "awaiting_funds",
          subject: "psychology",
          submitted_at: "2026-10-08T10:00:00Z",
          mode: "independent",
        },
        {
          id: "second-review",
          learner_id: "second",
          learner_name: "Sam",
          family_id: "20000000-0000-4000-8000-000000000001",
          family_name: "Hill family",
          state: "needs_review",
          subject: "business",
          submitted_at: "2026-10-10T10:00:00Z",
          mode: "independent",
        },
      ];
      json = {
        families: [
          { id: family, name: "River family" },
          { id: "20000000-0000-4000-8000-000000000001", name: "Hill family" },
        ],
        students: students.filter(
          (s) => !params.get("learner") || s.id === params.get("learner"),
        ),
        reviews: reviews.filter(
          (r) =>
            (!params.get("status") || r.state === params.get("status")) &&
            (!params.get("family") || r.family_id === params.get("family")),
        ),
        totals: { students: 2, reviews: 3, actionable: 2, blocked: 1 },
        offset: 0,
        pageSize: 25,
      };
    } else if (path.endsWith("/attempt"))
      json = {
        id: attempt,
        mode: "independent",
        state: "in_progress",
        deadline: null,
        serverNow: new Date().toISOString(),
        data: {
          subject: "psychology",
          questions,
          resources: [],
          choices: [],
          selected: [],
          instructions: "Answer all questions.",
          durationMinutes: 20,
        },
        answers: questions.map((q) => ({
          question_id: q.id,
          text: "",
          revision: 0,
          flagged: false,
        })),
      };
    else if (path.endsWith("/attempt/action")) json = { revision: ++revision };
    else if (path.endsWith("/history"))
      json = [
        {
          submissionId: "assessment",
          submittedAt: "2026-10-04T17:00:00Z",
          awarded: 8,
          available: 12,
          percentage: (100 * 8) / 12,
          questionCount: 2,
          mixed: false,
          evidence: [{ mode: "independent", assisted: false, seen: false }],
        },
      ];
    else if (path.endsWith("/assessment"))
      json = {
        id: "assessment",
        state: persona === "teacher" ? "needs_review" : "published",
        candidates:
          persona === "teacher"
            ? results.map((primary) => ({
                questionId: primary.questionId,
                primary,
                reviews: [],
              }))
            : [],
        choiceGroups: [],
        subject: "psychology",
        effective: persona === "teacher" ? undefined : results,
        questions,
        submission: {
          submitted_at: "2026-10-04T17:00:00Z",
          choices: [],
          answers: [
            {
              question_id: "q1",
              text: "A small sample may not be representative.",
            },
          ],
        },
      };
    else if (path.endsWith("/admin"))
      json = {
        checks: [],
        families: [
          {
            id: family,
            name: "River family",
            learners: [{ id: learner, name: "Alex" }],
            members: [],
            invites: [],
          },
        ],
        invitations: [],
        catalogue: [],
        rates: [],
        jobs: [],
      };
    await route.fulfill({ json });
  });
}
async function capture(page: Page, name: string, width: number) {
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > innerWidth)
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        width: el.getBoundingClientRect().width,
        right: el.getBoundingClientRect().right,
        position: getComputedStyle(el).position,
        overflow: getComputedStyle(el).overflow,
      })),
  );
  await expect
    .poll(
      () =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      { message: JSON.stringify(overflow) },
    )
    .toBe(true);
  await page.screenshot({
    path: `test-results/redesign-${name}-${width}.png`,
    fullPage: true,
  });
}
for (const width of [375, 768, 1024, 1440]) {
  test(`student journey and visual reference at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await fixture(page);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Your next step, Alex." }),
    ).toBeVisible();
    await expect(page.getByText("2", { exact: true })).toBeVisible();
    await capture(page, "student-today", width);
    await page
      .getByRole("button", { name: "Continue revision", exact: true })
      .click();
    await expect(
      page.getByText(questions[0].text, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Your answer", exact: true })
      .fill("A small sample may not reflect the wider population.");
    await expect(page.getByRole("status")).toHaveText("Saved to account");
    await capture(page, "student-practice", width);
    await page
      .getByRole("button", { name: "Review before submitting" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Back to study", exact: false })
      .click();
    await page
      .getByRole("button", { name: "My subjects", exact: true })
      .click();
    await expect(page).toHaveURL(/page=Subjects/);
    await page.getByRole("button", { name: "Topics", exact: true }).click();
    await page
      .getByRole("button", { name: "History", exact: true })
      .first()
      .click();
    await expect(page.getByRole("cell", { name: /8\/12/ })).toBeVisible();
    await page.getByRole("button", { name: "Answer & feedback" }).click();
    await expect(
      page.getByRole("heading", { name: "Your next improvement" }),
    ).toBeVisible();
    await capture(page, "student-feedback", width);
    await page
      .getByRole("button", { name: "Back", exact: false })
      .first()
      .click();
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await capture(page, "practice-picker", width);
  });
  for (const persona of ["parent", "teacher", "superuser"] as const)
    test(`${persona} workspace at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 960 });
      await fixture(page, persona);
      await page.goto("/");
      const title =
        persona === "parent"
          ? "A window into their week."
          : persona === "teacher"
            ? "Make your attention count."
            : "Keep learning moving.";
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      await capture(page, `${persona}-overview`, width);
      if (persona === "parent") {
        await page
          .getByRole("button", { name: "Manage funding", exact: true })
          .click();
        const cap = page.getByRole("spinbutton");
        await cap.fill("12");
        let changed = false;
        page.on("request", (r) => {
          if (r.url().endsWith("/family/action")) changed = true;
        });
        await cap.blur();
        expect(changed).toBe(false);
        await page.getByRole("button", { name: "Save limit" }).click();
        await expect(page.getByRole("status")).toHaveText(
          "Monthly limit saved for Alex.",
        );
        await capture(page, "parent-funding", width);
        await page.goto(`/?family=${family}&page=Progress`);
        await page.getByRole("button", { name: "Answer & feedback" }).click();
        await expect(
          page.getByRole("heading", { name: "Your next improvement" }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Ask your teacher to review" }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Publish supported result" }),
        ).toHaveCount(0);
      } else if (persona === "teacher") {
        await page
          .getByRole("button", { name: "All reviews", exact: false })
          .click();
        await expect(page.getByText(/Oct 1, 2026|1 Oct 2026/)).toBeVisible();
        await capture(page, "teacher-reviews", width);
        await page.getByRole("button", { name: "Review work" }).first().click();
        await expect(page).toHaveURL(/assessment=older-review/);
        await expect(
          page.getByRole("heading", { name: "Review decision" }),
        ).toBeVisible();
        await capture(page, "teacher-review-detail", width);
        await page
          .getByRole("button", { name: "Back", exact: false })
          .first()
          .click();
        await expect(
          page.getByRole("heading", { name: "The work that needs you." }),
        ).toBeVisible();
      } else {
        await page.getByRole("button", { name: "Manage families" }).click();
        await expect(
          page.getByRole("button", { name: "Add family" }),
        ).toBeVisible();
        await capture(page, "admin-families", width);
        await expect(
          page.getByRole("button", { name: "Practice", exact: true }),
        ).toHaveCount(0);
      }
    });
}

test("new student setup, URL navigation, persistent goals and enlarged text", async ({
  page,
}) => {
  await fixture(page, "student", true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Set up a course", exact: true })
    .click();
  await expect(page).toHaveURL(/page=Study/);
  await expect(
    page.getByText("Your family’s data", { exact: true }),
  ).toHaveCount(0);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Your next step, Alex." }),
  ).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/page=Study/);
  await page.reload();
  await expect(page).toHaveURL(/page=Study/);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "Edit goal" }).click();
  await page.getByLabel("Sessions per week").selectOption("5");
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("/ 5 sessions", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Toggle larger text" }).click();
  await page.setViewportSize({ width: 375, height: 960 });
  await capture(page, "student-large-text", 375);
});

test("teacher filters survive opening a review and browser back", async ({
  page,
}) => {
  await fixture(page, "teacher");
  await page.goto("/?context=teacher&page=Reviews&status=needs_review");
  await expect(
    page.getByRole("combobox", { name: "Status", exact: true }),
  ).toHaveValue("needs_review");
  await page.getByRole("button", { name: "Review work" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Review decision" }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("combobox", { name: "Status", exact: true }),
  ).toHaveValue("needs_review");
});

test("a new student can save a course and start their first practice", async ({
  page,
}) => {
  await fixture(page, "student", true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Set up a course", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Psychology", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "When are your exams?" })
    .selectOption("June 2027");
  await dialog
    .getByRole("combobox", { name: "Course specification", exact: true })
    .selectOption("2026");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Research methods" }).check();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Add Psychology", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page
    .getByRole("button", { name: "Start revision", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your answer", exact: true }),
  ).toBeEditable();
});

for (const superuser of [false, true])
  test(`workspace switching keeps authorised memberships separate (admin=${superuser})`, async ({
    page,
  }) => {
    await fixture(page, "parent");
    await page.route("**/api/v2/identity", (route) =>
      route.fulfill({
        json: {
          user: { id: "mixed", name: "Morgan", email: "mixed@example.test" },
          superuser,
          workspaces: [
            { id: family, name: "River family", role: "parent" },
            {
              id: "20000000-0000-4000-8000-000000000001",
              name: "Hill family",
              role: "teacher",
            },
          ],
        },
      }),
    );
    await page.goto("/");
    const picker = page.getByRole("combobox", {
      name: "Workspace",
      exact: true,
    });
    await expect(picker).toBeVisible();
    if (superuser)
      await expect(
        page.getByRole("button", { name: "Manage families" }),
      ).toBeVisible();
    await picker.selectOption(family);
    await expect(
      page.getByRole("heading", { name: "A window into their week." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Operations", exact: true }),
    ).toHaveCount(0);
    await picker.selectOption("teacher");
    await expect(
      page.getByRole("heading", { name: "Make your attention count." }),
    ).toBeVisible();
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "A window into their week." }),
    ).toBeVisible();
    await page.reload();
    await expect(picker).toHaveValue(family);
  });

test("failed autosave protects browser Back and preserves a recovery copy", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/v2/family/attempt/action", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { message: "Saving is temporarily unavailable." } },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Continue revision", exact: true })
    .click();
  const answer = page.getByRole("textbox", {
    name: "Your answer",
    exact: true,
  });
  await answer.fill("Keep this writing safe.");
  await page.goBack();
  await expect(
    page.getByText("Your writing could not sync.", { exact: false }),
  ).toBeVisible();
  await expect(answer).toHaveValue("Keep this writing safe.");
  await expect(page).toHaveURL(new RegExp(`attempt=${attempt}`));
  expect(
    await page.evaluate(
      ({ family, attempt }) =>
        localStorage.getItem(`sv-draft:${family}:${attempt}`),
      { family, attempt },
    ),
  ).toContain("Keep this writing safe.");
});

test("teacher publication keeps the family and queue filters", async ({
  page,
}) => {
  await fixture(page, "teacher");
  let decision: any;
  await page.route("**/api/v2/family/review", async (route) => {
    decision = route.request().postDataJSON();
    await route.fulfill({ json: { saved: true } });
  });
  await page.goto(
    `/?context=teacher&page=Reviews&filterFamily=${family}&status=needs_review`,
  );
  await page.getByRole("button", { name: "Review work" }).first().click();
  await expect(
    page.getByRole("button", { name: "Publish supported result" }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Reason", exact: true })
    .fill("Checked the original answer against the approved rubric.");
  await page.getByRole("button", { name: "Publish supported result" }).click();
  await expect(
    page.getByRole("heading", { name: "The work that needs you." }),
  ).toBeVisible();
  expect(decision.familyId).toBe(family);
  expect(decision.action).toBe("publish");
  expect(decision.results).toHaveLength(2);
  await expect(
    page.getByRole("combobox", { name: "Status", exact: true }),
  ).toHaveValue("needs_review");
});

test("teacher failure, retry and empty states are actionable", async ({
  page,
}) => {
  await fixture(page, "teacher");
  let fail = true;
  await page.route("**/api/v2/teacher/workspace?**", async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        json: { error: { message: "Could not load teaching work." } },
      });
    else
      await route.fulfill({
        json: {
          families: [],
          students: [],
          reviews: [],
          totals: { students: 0, reviews: 0, actionable: 0, blocked: 0 },
          offset: 0,
          pageSize: 25,
        },
      });
  });
  await page.goto("/?context=teacher&page=Reviews");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Could not load teaching work." }),
  ).toContainText("Could not load teaching work.");
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "All clear for this selection" }),
  ).toBeVisible();
});

test("mobile adult navigation supports keyboard dismissal and account access", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 768 });
  await fixture(page, "parent");
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  const drawer = page.getByRole("dialog", { name: "Your workspace" });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(menu).toBeFocused();
  await menu.click();
  await drawer.getByRole("button", { name: "Funding", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A clear view of your credit." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Your account" }),
  ).toBeVisible();
});

test("a timed deadline freezes editing and keeps the submitted state visible", async ({
  page,
}) => {
  await fixture(page);
  let reads = 0;
  await page.route("**/api/v2/family/attempt?**", async (route) => {
    const now = new Date();
    await route.fulfill({
      json: {
        id: attempt,
        mode: "timed",
        state: reads++ ? "submitted" : "in_progress",
        deadline: new Date(now.getTime() + 1000).toISOString(),
        serverNow: now.toISOString(),
        data: {
          subject: "psychology",
          questions,
          resources: [],
          choices: [],
          durationMinutes: 20,
        },
        answers: questions.map((q) => ({
          question_id: q.id,
          text: "An on-time answer.",
          revision: 1,
          flagged: false,
        })),
      },
    });
  });
  await page.goto(`/?family=${family}&attempt=${attempt}`);
  await expect(page.getByRole("status")).toHaveText(
    "Deadline reached. On-time saved answers are frozen.",
  );
  await expect(
    page.getByRole("textbox", { name: "Your answer", exact: true }),
  ).not.toBeEditable();
  await expect(
    page.getByText("Your submission is preserved.", { exact: false }),
  ).toBeVisible();
});

test("unpublished parent feedback remains read-only without scores or review controls", async ({
  page,
}) => {
  await fixture(page, "parent");
  await page.route("**/api/v2/family/assessment?**", (route) =>
    route.fulfill({
      json: {
        id: "pending",
        state: "awaiting_funds",
        questions,
        submission: {
          submitted_at: "2026-10-14T12:00:00Z",
          choices: [],
          answers: [],
        },
      },
    }),
  );
  await page.goto(`/?family=${family}&assessment=pending`);
  await expect(
    page.getByRole("heading", { name: "Your feedback is being checked." }),
  ).toBeVisible();
  await expect(
    page.getByText("Waiting for funding", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Publish supported result|Ask your teacher|Practise an improvement/,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your next improvement" }),
  ).toHaveCount(0);
});

test("feedback practice uses its subject even when another course was selected", async ({
  page,
}) => {
  await fixture(page, "student", false, true);
  let created: any;
  await page.route("**/api/v2/family/attempt/create", async (route) => {
    created = route.request().postDataJSON();
    await route.fulfill({ json: { id: attempt } });
  });
  await page.goto(
    `/?family=${family}&page=Progress&course=business-course&assessment=assessment`,
  );
  await page
    .getByRole("button", { name: "Practise this improvement", exact: false })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your answer", exact: true }),
  ).toBeEditable();
  expect(created.enrolmentId).toBe(course.id);
  expect(created.retryOf).toBe("assessment");
});

test("legacy funding errors do not ask students to manage money", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/v2/family/attempt?**", (route) =>
    route.fulfill({
      json: {
        id: attempt,
        mode: "independent",
        state: "draft",
        deadline: null,
        serverNow: new Date().toISOString(),
        data: {
          subject: "psychology",
          questions,
          resources: [],
          choices: [],
          durationMinutes: 20,
        },
        answers: questions.map((q) => ({
          question_id: q.id,
          text: "",
          revision: 0,
          flagged: false,
        })),
      },
    }),
  );
  await page.route("**/api/v2/family/attempt/action", async (route) => {
    if (route.request().postDataJSON().action === "quote")
      await route.fulfill({ json: { id: "quote", maxChargeMicros: 100000 } });
    else
      await route.fulfill({
        status: 409,
        json: {
          error: {
            code: "AWAITING_FUNDS",
            message:
              "Ask your parent to add credit before starting this practice.",
          },
        },
      });
  });
  await page.goto(`/?family=${family}&attempt=${attempt}`);
  await expect(
    page.getByRole("button", { name: "Get marking quote" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Start practice →", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Your saved work is safe" }),
  ).toBeVisible();
  await expect(page.getByText("Ask your parent", { exact: false })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("textbox", { name: "Your answer", exact: true }),
  ).not.toBeEditable();
});

for (const width of [375, 768, 1024, 1440]) {
  test(`guided course setup fits ${width}px and keeps choices between steps`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await fixture(page, "student", true);
    await page.goto("/");
    if (width === 375)
      await page.getByRole("button", { name: "Toggle larger text" }).click();
    await page
      .getByRole("button", { name: "Set up a course", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add Psychology", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await page.screenshot({ path: `test-results/course-details-${width}.png` });
    await expect(
      dialog.getByRole("combobox", {
        name: "Course specification",
        exact: true,
      }),
    ).toHaveValue("2026");
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      dialog.getByRole("heading", { name: "Let’s make this course yours." }),
    ).toBeVisible();
    await dialog
      .getByRole("combobox", { name: "When are your exams?", exact: true })
      .selectOption("June 2027");
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      dialog.getByRole("heading", { name: "Start with what you know." }),
    ).toBeFocused();
    await dialog
      .getByRole("checkbox", { name: "Research methods", exact: true })
      .check();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await dialog.getByRole("button", { name: "Add a study time" }).click();
    await expect(
      dialog.getByRole("spinbutton", { name: "Study minutes 1" }),
    ).toHaveValue("20");
    await dialog.getByRole("button", { name: "Back", exact: true }).click();
    await expect(
      dialog.getByRole("checkbox", { name: "Research methods", exact: true }),
    ).toBeChecked();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      dialog.getByRole("spinbutton", { name: "Study minutes 1" }),
    ).toHaveValue("20");
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    const save = dialog.getByRole("button", {
      name: "Add Psychology",
      exact: true,
    });
    const box = await save.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(850);
    await page.screenshot({ path: `test-results/course-setup-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(
      dialog.getByRole("button", { name: "Discard changes" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(
      dialog.getByRole("spinbutton", { name: "Study minutes 1" }),
    ).toHaveValue("20");
    await save.click();
    await expect(dialog).toHaveCount(0);
  });
}

test("course edits preserve existing settings and recover from a failed save", async ({
  page,
}) => {
  const existing = {
    ...course.data,
    sessionMinutes: 35,
    extraTimePercent: 25,
    option: "health",
    blockedDates: ["2027-01-02"],
    availability: [{ day: 2, start: "18:15", minutes: 20 }],
    examDates: [{ unit: "WPS03/01", date: "2027-06-10", confirmed: true }],
  };
  await fixture(page, "student", false, false, { ...course, data: existing });
  let saves = 0;
  let sent: any;
  await page.route("**/api/v2/family/enrolment", async (route) => {
    sent = route.request().postDataJSON().course;
    saves++;
    await route.fulfill({
      status: saves === 1 ? 503 : 200,
      json:
        saves === 1
          ? { error: { message: "Temporarily unavailable" } }
          : { saved: true },
    });
  });
  await page.goto("/?family=" + family + "&page=Family");
  await page.getByRole("button", { name: "My subjects", exact: true }).click();
  await page
    .getByRole("button", { name: "Manage courses", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Psychology", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.locator('input[type="time"]')).toHaveValue("18:15");
  await dialog.getByRole("button", { name: "Save Psychology" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Your choices are still here",
  );
  await expect(dialog.locator('input[type="time"]')).toHaveValue("18:15");
  await dialog.getByRole("button", { name: "Save Psychology" }).click();
  await expect(dialog).toHaveCount(0);
  expect(sent).toEqual(existing);
});

test("students see feedback pending without funding tasks", async ({
  page,
}) => {
  await fixture(page, "student", false, false, undefined, "waiting");
  await page.goto("/");
  await expect(
    page.getByText("Feedback pending", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Waiting for funding|Maximum marking|Add credit|Review funding/,
    ),
  ).toHaveCount(0);
});

test("parents receive funding actions and marking cost details", async ({
  page,
}) => {
  await fixture(page, "parent", false, false, undefined, "waiting");
  await page.goto("/");
  await page.getByRole("button", { name: "Review funding" }).click();
  await expect(
    page.getByRole("heading", { name: "Work waiting for marking" }),
  ).toBeVisible();
  await expect(
    page.getByText("Maximum marking cost:", { exact: false }),
  ).toContainText("€1");
  await expect(
    page.getByText("Increase this child’s monthly limit below.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save limit" })).toBeVisible();
  await page.screenshot({
    path: "test-results/parent-funding-action.png",
    fullPage: true,
  });
});

test("low balance appears in the parent overview", async ({ page }) => {
  await fixture(page, "parent", false, false, undefined, "low");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Family credit is running low." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review funding" }),
  ).toBeVisible();
});

async function examReferenceFixture(
  page: Page,
  broken = false,
  long = false,
  shared = false,
  options: { longQuestion?: boolean; tableAnswer?: boolean } = {},
) {
  await fixture(page);
  const prompt = options.longQuestion
    ? "Using Extract A, assess the proposed expansion. " +
      "Consider how the evidence, costs and uncertainty affect the decision. ".repeat(
        18,
      )
    : "Using Extract A, assess one reason why the business might expand into a new market.";
  const extracts = [
    {
      label: "A",
      heading: "A",
      text: "Aster Cycles sales revenue increased from £12.0m to £13.5m.",
      figures: [{ id: "exam-test-figure", width: 800, height: 420, page: 2 }],
    },
    {
      label: "B",
      cited: false,
      text: "Unrelated supporting material must not appear.",
    },
  ];
  const caseText = long
    ? Array.from(
        { length: 48 },
        (_, i) =>
          `Paragraph ${i + 1}. Aster Cycles sells bicycles to schools and local retailers. Its directors are considering a new market, but transport costs, currency changes and differences in demand could affect profit. The business must compare the benefits of expansion with the risks to its existing customers.`,
      ).join("\n\n")
    : "The business plans to invest £2m. Its directors are considering exchange-rate risk.";
  const examQuestions = [
    {
      ...questions[0],
      ...(options.tableAnswer
        ? { format: "table", tableColumns: ["Stage", "Evidence"] }
        : {}),
      number: "1(a)",
      section: "A",
      text: prompt,
      resourceIds: ["case-note"],
      extracts,
    },
    {
      ...questions[1],
      ...(shared ? { resourceIds: ["case-note"], extracts } : {}),
    },
  ];
  const saved: Record<
    string,
    { text: string; revision: number; flagged: boolean }
  > = {};
  await page.route("**/api/figures/exam-test-figure*", (route) =>
    broken
      ? route.fulfill({ status: 503, body: "Source unavailable" })
      : route.fulfill({
          contentType: "image/svg+xml",
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420" viewBox="0 0 800 420"><rect width="800" height="420" fill="white"/><g fill="#18202c" font-family="Arial" font-size="25"><text x="30" y="48">Extract A: Aster Cycles (synthetic example)</text><text x="30" y="100">Aster Cycles is considering a new overseas market.</text><text x="30" y="160">Measure</text><text x="470" y="160">2024</text><text x="650" y="160">2025</text><text x="30" y="225">Sales revenue (£m)</text><text x="470" y="225">12.0</text><text x="650" y="225">13.5</text><text x="30" y="290">Market share (%)</text><text x="470" y="290">8.0</text><text x="650" y="290">9.2</text><text x="30" y="380">Source: fictional figures for interface testing.</text></g><g stroke="#18202c"><path d="M30 175H760M30 240H760M30 305H760"/></g></svg>`,
        }),
  );
  await page.route("**/api/v2/family/attempt?**", (route) =>
    route.fulfill({
      json: {
        id: attempt,
        mode: "timed",
        state: "in_progress",
        deadline: new Date(Date.now() + 1200000).toISOString(),
        serverNow: new Date().toISOString(),
        data: {
          subject: "business",
          questions: examQuestions,
          resources: [
            {
              id: "case-note",
              title: "Additional case information",
              text: caseText,
              ...(long
                ? {
                    table: {
                      caption: "Table 1: financial results",
                      columns: ["Measure", "2024", "2025"],
                      rows: [
                        ["Revenue (£m)", "12.0", "13.5"],
                        ["Profit (£m)", "1.2", "1.1"],
                        ["Market share (%)", "8.0", "9.2"],
                      ],
                    },
                  }
                : {}),
            },
          ],
          choices: [],
          selected: [],
          durationMinutes: 20,
        },
        answers: questions.map((q) => ({
          question_id: q.id,
          ...(saved[q.id] ?? { text: "", revision: 0, flagged: false }),
        })),
      },
    }),
  );
  await page.route("**/api/v2/family/attempt/action", (route) => {
    const body = route.request().postDataJSON();
    if (body.action !== "save") return route.fallback();
    const revision = (saved[body.questionId]?.revision ?? 0) + 1;
    saved[body.questionId] = {
      text: body.text,
      flagged: body.flagged,
      revision,
    };
    return route.fulfill({ json: { revision } });
  });
  await page.goto(`/?family=${family}&attempt=${attempt}`);
  return prompt;
}
for (const width of [375, 768, 1024, 1440]) {
  test(`exam desk keeps sources and writing available at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    const prompt = await examReferenceFixture(page);
    const source = page.getByRole("region", {
      name: "Source desk",
      exact: true,
    });
    const answer = page.getByRole("region", {
      name: "Answer booklet",
      exact: true,
    });
    await expect(
      page.getByText(prompt, { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      source.getByRole("img", { name: /Extract A as printed/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", {
        name: "Additional case information",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Unrelated supporting material must not appear."),
    ).toHaveCount(0);
    await source
      .getByRole("combobox", { name: "Source zoom" })
      .selectOption("2");
    expect(
      await page
        .locator(".source-reader")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
    ).toBe(true);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    if (width >= 1024) {
      const left = await source.boundingBox(),
        right = await answer.boundingBox();
      expect(right!.x).toBeGreaterThan(left!.x + left!.width);
      await expect(
        page.getByRole("separator", { name: "Resize source and answer panes" }),
      ).toBeVisible();
    } else await page.getByRole("tab", { name: "Answer", exact: true }).click();
    const editor = answer.getByRole("textbox", {
      name: "Your answer",
      exact: true,
    });
    await expect(editor).toHaveAttribute("spellcheck", "false");
    await editor.fill("Sales increased by £1.5m, which may support expansion.");
    await expect(answer.getByRole("status")).toHaveText("Saved to account");
    await expect(
      page.getByRole("button", { name: "Review before submitting" }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/exam-desk-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Question 1(b), blank", exact: true })
      .click();
    await expect(
      page.getByText(questions[1].text, { exact: true }),
    ).toBeVisible();
    await expect(source).toHaveCount(0);
    await expect(editor).toBeVisible();
  });
}

test("an unavailable source image exposes its transcript and offers retry", async ({
  page,
}) => {
  await examReferenceFixture(page, true);
  await expect(
    page.getByText("The printed image could not load.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Aster Cycles sales revenue increased from £12.0m to £13.5m.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry source image" }),
  ).toBeVisible();
});

test("long evidence, a pinned table and a long essay retain independent places across questions and reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await examReferenceFixture(page, false, true, true);
  const reader = page.locator(".source-reader"),
    editor = page.getByRole("textbox", { name: "Your answer", exact: true });
  await page
    .getByRole("tab", { name: "Table 1: financial results", exact: true })
    .click();
  await page.getByRole("button", { name: "Pin table", exact: true }).click();
  const pinned = page.getByRole("complementary", { name: "Pinned reference" });
  const pinnedTab = page.getByRole("tab", {
    name: "Pinned · Table 1: financial results",
    exact: true,
  });
  await expect(pinned.getByText("Revenue (£m)", { exact: true })).toBeVisible();
  await page
    .getByRole("tab", { name: "Additional case information", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Source zoom" })
    .selectOption("1.25");
  const paragraph = reader.locator("[data-source-text]").nth(2);
  await paragraph.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selected = window.getSelection()!;
    selected.removeAllRanges();
    selected.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page
    .getByRole("button", { name: "Highlight selection", exact: true })
    .click();
  await expect(paragraph.locator("mark")).toHaveCount(1);
  const essay = Array.from(
    { length: 70 },
    (_, i) =>
      `Point ${i + 1}: Expansion may increase sales, but costs and demand must be considered carefully.`,
  ).join("\n\n");
  await editor.fill(essay);
  await expect(page.locator(".exam-save-row [role=status]")).toHaveText(
    "Saved to account",
  );
  await editor.evaluate((el: HTMLTextAreaElement) => {
    el.setSelectionRange(180, 180);
    el.scrollTop = 650;
    el.dispatchEvent(new Event("scroll"));
    el.dispatchEvent(new Event("select", { bubbles: true }));
  });
  const answerPlace = await editor.evaluate((el: HTMLTextAreaElement) => ({
    top: el.scrollTop,
    start: el.selectionStart,
  }));
  const questionBox = await page
      .locator(".exam-writing-pane .exam-question")
      .boundingBox(),
    answerBox = await editor.boundingBox();
  await reader.evaluate((el) => {
    el.scrollTop = 1400;
    el.dispatchEvent(new Event("scroll"));
  });
  const sourcePlace = await reader.evaluate((el) => el.scrollTop);
  expect(sourcePlace).toBeGreaterThan(1000);
  expect(await editor.evaluate((el) => el.scrollTop)).toBe(answerPlace.top);
  expect(
    await page.locator(".exam-writing-pane .exam-question").boundingBox(),
  ).toEqual(questionBox);
  expect(await editor.boundingBox()).toEqual(answerBox);
  await expect(pinnedTab).toBeVisible();
  await page
    .getByRole("button", { name: "Question 1(b), blank", exact: true })
    .click();
  expect(await reader.evaluate((el) => el.scrollTop)).toBe(sourcePlace);
  await page.getByRole("button", { name: /Question 1\(a\), answered/ }).click();
  expect(
    await editor.evaluate((el: HTMLTextAreaElement) => ({
      top: el.scrollTop,
      start: el.selectionStart,
    })),
  ).toEqual(answerPlace);
  const divider = page.getByRole("separator", {
    name: "Resize source and answer panes",
  });
  await divider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(divider).toHaveAttribute("aria-valuenow", "52");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem(
              Object.keys(localStorage).find((key) =>
                key.startsWith("gotfoth:exam-workspace:"),
              )!,
            )!,
          ).width,
      ),
    )
    .toBe(52);
  await page.reload();
  await expect(editor).toHaveValue(essay);
  await expect(divider).toHaveAttribute("aria-valuenow", "52");
  await expect(page.getByRole("combobox", { name: "Source zoom" })).toHaveValue(
    "1.25",
  );
  await expect(pinnedTab).toBeVisible();
  await expect(paragraph.locator("mark")).toHaveCount(1);
  await expect
    .poll(() => reader.evaluate((el) => el.scrollTop))
    .toBe(sourcePlace);
  expect(
    await editor.evaluate((el: HTMLTextAreaElement) => ({
      top: el.scrollTop,
      start: el.selectionStart,
    })),
  ).toEqual(answerPlace);
  await pinnedTab.click();
  await expect(pinned).toBeVisible();
  await page
    .getByRole("button", { name: "Show in context", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Table 1: financial results", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/exam-desk-long-evidence.png",
    fullPage: true,
  });
});

for (const width of [375, 768]) {
  test(`source and answer tabs retain reading and writing positions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await examReferenceFixture(page, false, true, true);
    const reader = page.locator(".source-reader"),
      editor = page.getByRole("textbox", { name: "Your answer", exact: true });
    await page
      .getByRole("tab", { name: "Additional case information", exact: true })
      .click();
    await reader.evaluate((el) => {
      el.scrollTop = 700;
      el.dispatchEvent(new Event("scroll"));
    });
    await page.getByRole("tab", { name: "Answer", exact: true }).click();
    await editor.fill("A long answer.\n".repeat(100));
    await editor.evaluate((el: HTMLTextAreaElement) => {
      el.setSelectionRange(90, 90);
      el.scrollTop = 450;
      el.dispatchEvent(new Event("scroll"));
    });
    const place = await editor.evaluate((el: HTMLTextAreaElement) => ({
      top: el.scrollTop,
      start: el.selectionStart,
    }));
    await page.getByRole("tab", { name: "Source", exact: true }).click();
    await expect.poll(() => reader.evaluate((el) => el.scrollTop)).toBe(700);
    await expect(page.locator(".exam-mobile-question h2")).toBeVisible();
    await page.getByRole("tab", { name: "Answer", exact: true }).click();
    expect(
      await editor.evaluate((el: HTMLTextAreaElement) => ({
        top: el.scrollTop,
        start: el.selectionStart,
      })),
    ).toEqual(place);
    await expect(
      page.getByRole("button", { name: "Review before submitting" }),
    ).toBeInViewport();
  });
}

test("an enlarged long question remains keyboard-readable without hiding submission controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await examReferenceFixture(page, false, true, false, { longQuestion: true });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  await page.getByRole("tab", { name: "Answer", exact: true }).click();
  const question = page
    .locator(".exam-writing-pane")
    .getByRole("region", { name: "Question text" });
  await expect(question).toHaveAttribute("tabindex", "0");
  await question.focus();
  await page.keyboard.press("End");
  await expect(
    page
      .getByRole("button", { name: "Expand question area", exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Expand question area", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page
      .getByRole("button", { name: "Reduce question area", exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review before submitting" })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Review before submitting" }),
  ).toBeInViewport();
  await expect(page.locator(".exam-writing-pane h2")).toBeInViewport();
  expect(
    await page
      .getByRole("textbox", { name: "Your answer", exact: true })
      .evaluate((el) => el.clientHeight),
  ).toBeGreaterThan(120);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/exam-desk-enlarged-text.png",
    fullPage: true,
  });
});

test("table answers keep their cell selection and scroll position between questions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await examReferenceFixture(page, false, false, true, { tableAnswer: true });
  for (let i = 0; i < 12; i++)
    await page.getByRole("button", { name: "Add row", exact: true }).click();
  const input = page.getByRole("textbox", {
    name: "Evidence, row 10",
    exact: true,
  });
  await input.fill("Evidence from the case study");
  await input.focus();
  await input.evaluate((el: HTMLInputElement) => {
    el.setSelectionRange(3, 8);
    el.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await page.locator(".exam-table-answer").evaluate((el) => {
    el.scrollTop = 300;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  const top = await page
    .locator(".exam-table-answer")
    .evaluate((el) => el.scrollTop);
  await page
    .getByRole("button", { name: "Next question →", exact: true })
    .click();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(input).toHaveValue("Evidence from the case study");
  expect(
    await page.locator(".exam-table-answer").evaluate((el) => el.scrollTop),
  ).toBe(top);
  expect(
    await input.evaluate((el: HTMLInputElement) => [
      el.selectionStart,
      el.selectionEnd,
    ]),
  ).toEqual([3, 8]);
});

test("each question remembers its selected source while shared source positions stay intact", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await examReferenceFixture(page, false, true, true);
  const table = page.getByRole("tab", {
    name: "Table 1: financial results",
    exact: true,
  });
  const caseStudy = page.getByRole("tab", {
    name: "Additional case information",
    exact: true,
  });
  await table.click();
  await page
    .getByRole("button", { name: "Next question →", exact: true })
    .click();
  await caseStudy.click();
  await page.locator(".source-reader").evaluate((el) => {
    el.scrollTop = 900;
    el.dispatchEvent(new Event("scroll"));
  });
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(table).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Next question →", exact: true })
    .click();
  await expect(caseStudy).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(() => page.locator(".source-reader").evaluate((el) => el.scrollTop))
    .toBe(900);
});

test("resuming guided practice advances past a remembered submitted question", async ({
  page,
}) => {
  await fixture(page);
  await page.addInitScript(
    ({ family, attempt }) => {
      localStorage.setItem(
        `gotfoth:exam-workspace:test:${family}:${attempt}`,
        JSON.stringify({
          version: 1,
          question: "q1",
          width: 50,
          view: "answer",
          sources: { readers: {} },
          answers: {},
        }),
      );
    },
    { family, attempt },
  );
  await page.route("**/api/v2/family/attempt?**", (route) =>
    route.fulfill({
      json: {
        id: attempt,
        mode: "guided",
        state: "in_progress",
        submittedQuestionIds: ["q1"],
        deadline: null,
        serverNow: new Date().toISOString(),
        data: {
          subject: "psychology",
          questions,
          resources: [],
          choices: [],
          selected: [],
          durationMinutes: 20,
        },
        answers: questions.map((q) => ({
          question_id: q.id,
          text: q.id === "q1" ? "Previously submitted answer" : "",
          flagged: false,
          revision: 1,
        })),
      },
    }),
  );
  await page.goto(`/?family=${family}&attempt=${attempt}`);
  await expect(
    page.getByRole("heading", { name: "Question 1(b)", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Your answer", exact: true }),
  ).toBeEditable();
});

for (const viewport of [
  { width: 1366, height: 650 },
  { width: 1024, height: 768 },
  { width: 768, height: 740 },
  { width: 375, height: 740 },
]) {
  test(`pinned reference uses one full reader and fits every table row at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await examReferenceFixture(page, false, true, true);
    const reader = page.locator(".source-reader"),
      source = page.getByRole("region", { name: "Source desk", exact: true });
    await source
      .getByRole("tab", { name: "Table 1: financial results", exact: true })
      .click();
    await source
      .getByRole("button", { name: "Pin table", exact: true })
      .click();
    await expect(
      source.getByRole("combobox", { name: "Source zoom" }),
    ).toHaveValue("page");
    await expect(
      source.getByRole("complementary", { name: "Pinned reference" }),
    ).toBeVisible();
    const pinnedTab = source.getByRole("tab", {
      name: "Pinned · Table 1: financial results",
      exact: true,
    });
    expect((await pinnedTab.boundingBox())!.x).toBeGreaterThanOrEqual(
      (await source.getByRole("tablist", { name: "Sources" }).boundingBox())!.x,
    );
    await expect(reader.getByRole("table")).toHaveCount(1);
    await expect
      .poll(async () =>
        reader.evaluate((element) => {
          const table = element.querySelector("table")!,
            last = table.querySelector("tbody tr:last-child")!;
          const frame = element.getBoundingClientRect(),
            bounds = last.getBoundingClientRect();
          return (
            bounds.bottom <= frame.bottom + 1 &&
            bounds.right <= frame.right + 1 &&
            element.scrollHeight <= element.clientHeight + 1 &&
            element.scrollWidth <= element.clientWidth + 1
          );
        }),
      )
      .toBe(true);
    expect(await source.locator(".source-pin-content").count()).toBe(0);
    await page.screenshot({
      path: `test-results/source-fit-pinned-${viewport.width}.png`,
      fullPage: true,
    });
    await source
      .getByRole("tab", { name: "Additional case information", exact: true })
      .click();
    await expect(
      source.getByRole("complementary", { name: "Pinned reference" }),
    ).toHaveCount(0);
    await expect(reader.locator("[data-source-text]")).toHaveCount(48);
    await source
      .getByRole("tab", {
        name: "Pinned · Table 1: financial results",
        exact: true,
      })
      .click();
    await page.reload();
    await expect(
      source.getByRole("tab", {
        name: "Pinned · Table 1: financial results",
        exact: true,
      }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(reader.getByRole("table")).toHaveCount(1);
  });
}

test("fit page uses available width and height and fit width restores readable long text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 650 });
  await examReferenceFixture(page, false, true, true);
  const source = page.getByRole("region", { name: "Source desk", exact: true }),
    reader = page.locator(".source-reader");
  await source
    .getByRole("tab", { name: "Additional case information", exact: true })
    .click();
  const zoom = source.getByRole("combobox", { name: "Source zoom" });
  await expect(zoom).toHaveValue("width");
  await reader.evaluate((el) => {
    el.scrollTop = 700;
    el.dispatchEvent(new Event("scroll"));
  });
  await zoom.selectOption("page");
  await expect
    .poll(() =>
      reader.evaluate((element) => {
        const frame = element.getBoundingClientRect(),
          text = element
            .querySelector(".source-block:last-child")!
            .getBoundingClientRect();
        return (
          text.bottom <= frame.bottom + 1 &&
          element.scrollHeight <= element.clientHeight + 1 &&
          element.scrollWidth <= element.clientWidth + 1
        );
      }),
    )
    .toBe(true);
  await zoom.selectOption("width");
  await expect.poll(() => reader.evaluate((el) => el.scrollTop)).toBe(700);
  expect(await reader.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await source.getByRole("tab", { name: "Extract A", exact: true }).click();
  await expect(zoom).toHaveValue("page");
  await page.setViewportSize({ width: 1366, height: 900 });
  await expect
    .poll(async () =>
      Number(await reader.locator(".source-canvas").getAttribute("data-scale")),
    )
    .toBeGreaterThan(0.99);
  const largerScale = Number(
    await reader.locator(".source-canvas").getAttribute("data-scale"),
  );
  await page.setViewportSize({ width: 1366, height: 650 });
  await expect
    .poll(async () =>
      Number(await reader.locator(".source-canvas").getAttribute("data-scale")),
    )
    .toBeLessThan(largerScale - 0.01);
  await expect
    .poll(() =>
      reader.evaluate((element) => {
        const frame = element.getBoundingClientRect(),
          image = element.querySelector("img")!.getBoundingClientRect();
        return (
          image.bottom <= frame.bottom + 1 && image.right <= frame.right + 1
        );
      }),
    )
    .toBe(true);
});
