import { test, expect, type BrowserContext, type Page } from "@playwright/test";
const family = "7e570000-0000-4000-8000-000000000001",
  learner = "7e570000-0000-4000-8000-000000000010",
  courseId = "7e570000-0000-4000-8000-000000000020",
  attempt = "7e570000-0000-4000-8000-000000000030";
const phone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const course = {
  id: courseId,
  learner_id: learner,
  data: {
    subject: "psychology",
    specification: "2026",
    targetSession: "June 2027",
    taughtTopics: ["research.methods"],
    option: "health",
    extraTimePercent: 0,
    timezone: "Europe/Amsterdam",
    sessionMinutes: 20,
    availability: [],
    blockedDates: [],
    examDates: [],
  },
};
const result = {
  questionId: "q1",
  rubricId: "rubric",
  awarded: 3,
  available: 4,
  achievements: ["A clear point."],
  improvement: "Develop the example.",
  justification: "Supported by the rubric.",
  evidence: [],
  uncertainty: [],
};
async function fixture(context: BrowserContext, role = "student") {
  const calls: { path: string; body: any }[] = [],
    state = {
      read: false,
      snoozed: false,
      goal: 3,
      groups: (role === "teacher"
        ? [
            {
              id: "group",
              name: "Research group",
              members: [{ family_id: family, learner_id: learner }],
            },
          ]
        : []) as any[],
      sessionState: "proposed",
      cap: 10,
    };
  await context.route("**/api/v2/**", async (request) => {
    const url = new URL(request.request().url()),
      path = url.pathname.split("/api/v2/")[1],
      post = request.request().method() === "POST",
      body = post ? request.request().postDataJSON() : null;
    calls.push({ path, body });
    let value: any = {};
    const summary = {
      role,
      learners: [{ id: learner, name: "Alex", monthly_cap: state.cap * 1e6 }],
      enrolments: [course],
      topics: { psychology: ["research.methods", "clinical.psychology"] },
      attempts: [
        {
          id: attempt,
          learner_id: learner,
          subject: "psychology",
          mode: "independent",
          state: "in_progress",
          duration_minutes: 20,
        },
      ],
      assessments: [
        {
          id: "published",
          learner_id: learner,
          subject: "psychology",
          state: "published",
          effective: [result],
          submitted_at: "2026-10-18T12:00:00Z",
        },
      ],
      sessions: [],
      calendar: "disconnected",
    };
    if (path === "identity")
      value = {
        user: { id: "person", email: "person@example.test", name: "Alex" },
        superuser: role === "superuser",
        workspaces:
          role === "superuser"
            ? []
            : [
                { id: family, name: "River family", role },
                ...(role === "teacher"
                  ? [
                      {
                        id: "7e570000-0000-4000-8000-000000000002",
                        name: "Hill family",
                        role,
                      },
                    ]
                  : []),
              ],
      };
    else if (path === "family/summary" || path === "family/snapshot")
      value = { ...summary, papers: [], recoveries: [] };
    else if (path === "family/motivation") {
      if (post) state.goal = body.goal;
      value = {
        goal: state.goal,
        timezone: "Europe/Amsterdam",
        weekly: 2,
        total: 5,
        milestones: [1, 5],
      };
    } else if (path === "family/attempt-summary")
      value = {
        id: attempt,
        subject: "psychology",
        mode: "independent",
        state: "in_progress",
        duration_minutes: 20,
        saved_at: "2026-10-19T10:00:00Z",
      };
    else if (path === "family/activity")
      value = {
        items: [
          {
            id: "published",
            learner_id: learner,
            subject: "psychology",
            mode: "independent",
            state: "published",
            effective: [result],
            submitted_at: "2026-10-18T12:00:00Z",
          },
        ],
        offset: Number(url.searchParams.get("offset") ?? 0),
        limit: 25,
        total: 126,
      };
    else if (path === "family/history") value = [];
    else if (path === "family/assessment")
      value = {
        id: "published",
        state: role === "teacher" ? "needs_review" : "published",
        subject: "psychology",
        questions: [
          {
            id: "q1",
            number: "1",
            text: "Explain the research evidence.",
            marks: 4,
            topics: ["research.methods"],
            rubric: { id: "rubric", text: "Credit a clear explanation." },
          },
        ],
        resources: [],
        effective: role === "teacher" ? undefined : [result],
        candidates: [],
        provenance: {},
        submission: {
          submitted_at: "2026-10-18T12:00:00Z",
          choices: [],
          answers: [{ question_id: "q1", text: "A considered answer." }],
        },
      };
    else if (path === "family/diary")
      value = {
        items: [
          {
            id: "session",
            learner_id: learner,
            state: state.sessionState,
            data: {
              title: "Psychology · Research methods",
              timezone: "Europe/Amsterdam",
              start: "2026-10-20T15:00:00Z",
              minutes: 20,
              purpose: "A manageable session",
              attemptId:
                state.sessionState === "approved" ? attempt : undefined,
            },
          },
        ],
        exams: [],
        total: 1,
        offset: 0,
        limit: 25,
      };
    else if (path === "family/plan/action") {
      state.sessionState =
        body.action === "approve" ? "approved" : state.sessionState;
      value = { saved: true };
    } else if (path === "family/plan/create" || path === "family/planning")
      value = { saved: true };
    else if (path === "family/funding")
      value = {
        learners: summary.learners,
        wallet: {
          balance: 2000000,
          reserved: 500000,
          ledger: [],
          awaiting: [],
        },
        payments: [],
        total: 0,
        offset: 0,
        limit: 25,
      };
    else if (path === "family/action") {
      state.cap = body.micros / 1e6;
      value = { saved: true };
    } else if (path === "reminders")
      value = {
        items: state.snoozed
          ? []
          : [
              {
                key: "feedback:one",
                title: "Feedback ready",
                detail: "Psychology · River family",
                href: `/?context=${family}&family=${family}&page=Progress&assessment=published`,
                read: state.read,
                actionable: false,
              },
            ],
        settings: {
          timezone: "Europe/Amsterdam",
          calendarTiming: "default",
          lowCreditMicros: 5000000,
        },
        unread: state.read ? 0 : 1,
        total: state.snoozed ? 0 : 1,
        offset: 0,
        limit: 25,
      };
    else if (path === "reminders/action") {
      state.read = true;
      state.snoozed = body.action === "snooze";
      value = { saved: true };
    } else if (path === "reminders/preferences") value = { saved: true };
    else if (path === "teacher/groups") {
      if (post) {
        state.groups = [
          {
            id: "group",
            name: body.name,
            members: body.members.map((m: any) => ({
              family_id: m.familyId,
              learner_id: m.learnerId,
            })),
          },
        ];
        value = { id: "group" };
      } else value = { groups: state.groups };
    } else if (path === "teacher/comparison")
      value = {
        group: { id: "group", name: "Research group" },
        from: "2026-07-19T00:00:00Z",
        to: "2026-10-19T00:00:00Z",
        benchmarks: [],
        benchmark: "",
        median: null,
        count: 0,
        students: [],
        activity: [
          {
            id: learner,
            name: "Alex",
            familyName: "River family",
            submissions: 3,
            pending: 1,
          },
        ],
      };
    else if (path === "teacher/workspace")
      value = {
        families: [{ id: family, name: "River family" }],
        students: [
          {
            id: learner,
            name: "Alex",
            family_id: family,
            family_name: "River family",
            courses: [course.data],
            pending: 1,
            open_attempts: 1,
          },
        ],
        reviews: [
          {
            id: "review",
            learner_id: learner,
            learner_name: "Alex",
            family_id: family,
            family_name: "River family",
            subject: "psychology",
            state: "needs_review",
            submitted_at: "2026-10-10T12:00:00Z",
            has_query: true,
          },
        ],
        totals: { students: 1, reviews: 1, actionable: 1, blocked: 0 },
        offset: 0,
        pageSize: 25,
      };
    else if (path === "admin/companion")
      value = {
        counts: { families: 2, invitations: 3, content: 1, operations: 1 },
        kind: "operations",
        items: [{ id: "job", kind: "mark", state: "failed" }],
        members: [],
        invitations: [],
        offset: 0,
        limit: 25,
        more: false,
      };
    await request.fulfill({ json: value });
  });
  return { calls, state };
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
test.describe("phone companion", () => {
  test.use({
    userAgent: phone,
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  test("student has a separate companion and attempt links never load questions or acquire the editor", async ({
    context,
    page,
  }) => {
    const { calls } = await fixture(context);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "A little clearer, Alex." }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/companion-student-today.png",
      fullPage: true,
    });
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(
      nav.getByRole("button", { name: "Diary", exact: true }),
    ).toBeVisible();
    await expect(
      nav.getByRole("button", { name: "Practice", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Continue on a computer",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(`/?context=${family}&attempt=${attempt}`);
    await expect(
      page.getByRole("heading", {
        name: "Continue on a computer",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Computer link")).toHaveValue(
      new RegExp(attempt),
    );
    await expect(page.locator("textarea")).toHaveCount(0);
    expect(
      calls.some(
        (c) =>
          c.path === "family/attempt" || c.path === "family/attempt/action",
      ),
    ).toBe(false);
    expect(calls.some((c) => c.path === "family/snapshot")).toBe(false);
    await page.screenshot({
      path: "test-results/companion-student-phone.png",
      fullPage: true,
    });
    await noOverflow(page);
  });
  test("diary approval prepares a session and opens a computer continuation", async ({
    context,
    page,
  }) => {
    const { calls } = await fixture(context);
    await page.goto(`/?context=${family}&page=Plan&date=2026-10-20`);
    await page.getByRole("button", { name: "Approve session" }).click();
    await page.getByRole("button", { name: "Open planned practice" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Continue on a computer",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      calls.filter(
        (c) => c.path === "family/plan/action" && c.body.action === "approve",
      ),
    ).toHaveLength(1);
    expect(calls.some((c) => c.path === "family/attempt/action")).toBe(false);
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "Your diary." }),
    ).toBeVisible();
    await noOverflow(page);
  });
  test("diary opens as a calendar and progress opens as a chart", async ({
    context,
    page,
  }) => {
    await fixture(context);
    await page.goto(`/?context=${family}&page=Plan&date=2026-10-20`);
    await expect(
      page.getByRole("heading", { name: "October 2026" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Tuesday 20 October", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Jump to date")).not.toBeVisible();
    await expect(
      page.locator("#diary-2026-10-20").getByText("17:00", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/diary-recognisable-phone.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Next period" }).click();
    await expect(page).toHaveURL(/date=2026-10-27/);
    await page.getByRole("button", { name: "Previous period" }).click();
    await expect(page).toHaveURL(/date=2026-10-20/);
    await page
      .getByRole("group", { name: "Diary view" })
      .getByRole("button", { name: "Day", exact: true })
      .click();
    await expect(page.locator(".diary-page")).toHaveCount(1);
    await page.getByRole("button", { name: "Next period" }).click();
    await expect(page).toHaveURL(/date=2026-10-21/);
    await noOverflow(page);
    await page.goto(`/?context=${family}&page=Progress`);
    await expect(
      page.getByRole("region", {
        name: "Published result chart, oldest to newest",
      }),
    ).toBeVisible();
    await expect(page.getByLabel("History from")).not.toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Subject", exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByRole("button", { name: /psychology,.*75%/ }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/progress-visual-phone.png",
      fullPage: true,
    });
    await page.getByLabel("Progress period").selectOption("28");
    await expect(page).toHaveURL(/from=/);
    await page
      .getByRole("combobox", { name: "Subject", exact: true })
      .selectOption(courseId);
    await expect(page).toHaveURL(new RegExp(`course=${courseId}`));
    await page.locator(".progress-date-settings summary").click();
    await expect(page.getByLabel("History from")).toBeVisible();
    await noOverflow(page);
  });
  test("reminder inbox puts two complete reminders above phone navigation", async ({
    context,
    page,
  }) => {
    const { calls } = await fixture(context);
    await context.route("**/api/v2/identity", (route) =>
      route.fulfill({
        json: {
          user: {
            id: "ux-fixture-alex",
            email: "alex@ux.gotfoth.test",
            name: "Alex",
          },
          superuser: false,
          workspaces: [{ id: family, name: "River family", role: "student" }],
        },
      }),
    );
    await context.route(/\/api\/v2\/reminders\?/, (route) =>
      route.fulfill({
        json: {
          items: [
            {
              key: "session:one",
              title: "Alex River · Psychology · Research methods",
              detail: "Wed 21 Oct, 19:56 · Europe/Amsterdam",
              href: `/?context=${family}&page=Plan&date=2026-10-21`,
              actionable: true,
              read: false,
            },
            {
              key: "feedback:one",
              title: "Alex River · feedback ready",
              detail: "River family · Psychology",
              href: `/?context=${family}&page=Progress&assessment=published`,
              actionable: false,
              read: false,
            },
          ],
          settings: {
            timezone: "Europe/Amsterdam",
            calendarTiming: "default",
            lowCreditMicros: 5000000,
          },
          unread: 2,
          total: 2,
          offset: 0,
          limit: 25,
        },
      }),
    );
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`/?context=${family}&page=Reminders`);
    await expect(
      page.getByRole("heading", { name: "Reminders", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("2 unread", { exact: true })).toBeVisible();
    const rows = page.locator(".reminder-item");
    await expect(rows).toHaveCount(2);
    const last = await rows.last().boundingBox(),
      nav = await page
        .getByRole("navigation", { name: "Main navigation" })
        .boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(nav!.y);
    for (const button of await rows.getByRole("button").all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      path: "test-results/reminders-compact-phone.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Reminder settings", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("Google Calendar reminder")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Refresh reminders" }).click();
    await expect(page.locator(".reminder-list")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "22px";
    });
    await noOverflow(page);
    await rows
      .last()
      .getByRole("button", { name: /Open reminder/ })
      .click();
    await expect(page).toHaveURL(/assessment=published/);
    expect(
      calls.some(
        (c) => c.path === "reminders/action" && c.body.action === "read",
      ),
    ).toBe(true);
  });
  test("published history paginates and reminder state survives reload", async ({
    context,
    page,
  }) => {
    const { calls } = await fixture(context);
    await page.goto(`/?context=${family}&page=Progress`);
    await expect(
      page.getByRole("button", { name: "Answer & feedback" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/offset=25/);
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Reminders" })
      .click();
    await page.getByRole("button", { name: "Mark read" }).click();
    await expect(page.getByText("0 unread")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Mark read" })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Until tomorrow" }).click();
    await expect(
      page.getByRole("heading", { name: "You’re up to date" }),
    ).toBeVisible();
    expect(
      calls.some(
        (c) => c.path === "reminders/action" && c.body.action === "snooze",
      ),
    ).toBe(true);
  });
  test("student updates planning fields without opening full course setup", async ({
    context,
    page,
  }) => {
    const { calls } = await fixture(context);
    await page.goto(`/?context=${family}&page=Subjects`);
    await page.getByRole("button", { name: /Topics taught/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox").last().check();
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(
      page.getByText("Changes saved.", { exact: true }),
    ).toBeVisible();
    const save = calls.find((c) => c.path === "family/planning");
    expect(Object.keys(save!.body.patch)).toEqual(["taughtTopics"]);
    await expect(
      page.getByRole("button", { name: "Add Psychology", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: /Study routine/ }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Preferred session length")
      .fill("30");
    await page.setViewportSize({ width: 375, height: 420 });
    await expect(
      page.getByRole("dialog").getByLabel("Preferred session length"),
    ).toHaveValue("30");
    await page.keyboard.press("Escape");
    await noOverflow(page);
  });
  test("teacher reads saved groups on mobile and account drawer supports keyboard dismissal", async ({
    context,
    page,
  }) => {
    await fixture(context, "teacher");
    await page.goto("/?context=teacher&page=Groups&group=group");
    await expect(
      page.getByText("Not enough comparable evidence.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create group", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Your account and workspaces", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Your account and workspaces",
        exact: true,
      }),
    ).toBeFocused();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "24px";
    });
    await noOverflow(page);
  });
  test("parent can save funding limits but cannot review or alter courses", async ({
    context,
    page,
  }) => {
    await fixture(context, "parent");
    await page.goto(`/?context=${family}&page=Credit`);
    await expect(
      page.getByRole("heading", { name: "Monthly limits" }),
    ).toBeVisible();
    await page.getByRole("spinbutton").fill("15");
    await page.getByRole("button", { name: "Save limit" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Monthly limit saved for Alex.",
    );
    await page.goto(`/?context=${family}&page=Progress&assessment=published`);
    await expect(page.getByText("A considered answer.")).toBeAttached();
    await expect(
      page.getByRole("button", { name: "Publish supported result" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Query this result" }),
    ).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({
      path: "test-results/companion-parent-phone.png",
      fullPage: true,
    });
  });
  test("teacher sees attention and submitted work without review controls", async ({
    context,
    page,
  }) => {
    await fixture(context, "teacher");
    await page.goto("/?context=teacher");
    await expect(
      page.getByRole("heading", { name: "Know where to help." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Read submitted work →" }).click();
    await expect(
      page.getByRole("heading", { name: "Review on a computer" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Review decision" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Publish supported result" }),
    ).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({
      path: "test-results/companion-teacher-phone.png",
      fullPage: true,
    });
  });
  test("superuser sees operational summaries without mutation controls", async ({
    context,
    page,
  }) => {
    await fixture(context, "superuser");
    await page.goto("/?context=admin");
    await expect(
      page.getByRole("heading", { name: "Keep learning moving." }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save family" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: "Recover job" })).toHaveCount(
      0,
    );
    await noOverflow(page);
    await page.screenshot({
      path: "test-results/companion-admin-phone.png",
      fullPage: true,
    });
  });
});
test("diary and visual progress reflow across phone, tablet and desktop", async ({
  browser,
}) => {
  for (const width of [375, 768, 1024, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 960 },
      ...(width < 1440
        ? { userAgent: phone, isMobile: true, hasTouch: true }
        : {}),
    });
    try {
      await fixture(context);
      const page = await context.newPage();
      await page.goto(`/?context=${family}&page=Plan&date=2026-10-20`);
      await expect(
        page.getByRole("heading", { name: "Your diary." }),
      ).toBeVisible();
      await noOverflow(page);
      await page.screenshot({
        path: `test-results/diary-${width}.png`,
        fullPage: true,
      });
      await context.route(/\/api\/v2\/family\/activity\?/, (route) =>
        route.fulfill({
          json: {
            items: [
              {
                id: "latest",
                state: "published",
                subject: "psychology",
                mode: "independent",
                submitted_at: "2026-10-19T12:00:00Z",
                effective: [result],
              },
              {
                id: "business",
                state: "published",
                subject: "business",
                mode: "guided",
                assisted: "true",
                submitted_at: "2026-10-18T12:00:00Z",
                effective: [{ ...result, awarded: 2 }],
              },
              {
                id: "previous",
                state: "published",
                subject: "psychology",
                mode: "timed",
                submitted_at: "2026-10-17T12:00:00Z",
                effective: [{ ...result, awarded: 1 }],
              },
            ],
            total: 3,
            offset: 0,
            limit: 25,
          },
        }),
      );
      await page.goto(`/?context=${family}&page=Progress`);
      await expect(
        page.getByRole("heading", { name: "Results over time" }),
      ).toBeVisible();
      await expect(page.locator(".performance-bar-item")).toHaveCount(3);
      await noOverflow(page);
      await page.screenshot({
        path: `test-results/performance-${width}.png`,
        fullPage: true,
      });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "22px";
      });
      await noOverflow(page);
      await context.route(/\/api\/v2\/family\/activity\?/, (route) =>
        route.fulfill({ json: { items: [], total: 0, offset: 0, limit: 25 } }),
      );
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Your story starts with practice." }),
      ).toBeVisible();
      await expect(page.locator(".performance-bar-item")).toHaveCount(0);
    } finally {
      await context.close();
    }
  }
});
test("desktop-sized iPad retains the companion and does not offer test controls", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 1024 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
    hasTouch: true,
  });
  try {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "platform", { value: "MacIntel" });
      Object.defineProperty(navigator, "maxTouchPoints", { value: 5 });
    });
    await fixture(context);
    const page = await context.newPage();
    await page.goto(`/?context=${family}&attempt=${attempt}`);
    await expect(page.locator('[data-experience="companion"]')).toBeVisible();
    await expect(page.locator("textarea")).toHaveCount(0);
    await page.screenshot({
      path: "test-results/companion-ipad.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
test("desktop groups support explicit saved membership and narrow windows remain desktop", async ({
  context,
  page,
}) => {
  await fixture(context, "teacher");
  await page.goto("/?context=teacher&page=Groups");
  await page.getByRole("button", { name: "Create group" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Group name").fill("Research group");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Save group" }).click();
  await expect(page).toHaveURL(/group=group/);
  await expect(
    page.getByText("Not enough comparable evidence.", { exact: false }),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    page.getByRole("button", { name: "Create group" }),
  ).toBeAttached();
  await expect(page.locator('[data-experience="companion"]')).toHaveCount(0);
});
