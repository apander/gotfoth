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
async function fixture(page: Page, parent = false, admin = false) {
  let revision = 0;
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
        user: { id: "test", email: "test@example.test" },
        superuser: admin,
        workspaces: [
          {
            id: family,
            name: "Anderson family",
            role: parent ? "parent" : "student",
          },
        ],
      };
    else if (path.endsWith("/snapshot"))
      json = {
        role: parent ? "parent" : "student",
        learners: [{ id: learner, name: "Oliver", monthly_cap: 10000000 }],
        enrolments: [course],
        attempts: [
          {
            id: attempt,
            learner_id: learner,
            subject: "psychology",
            mode: "independent",
            state: "in_progress",
            created_at: "2026-10-05T17:00:00Z",
          },
        ],
        assessments: [
          {
            id: "assessment",
            learner_id: learner,
            state: "published",
            mode: "independent",
            submitted_at: "2026-10-04T17:00:00Z",
            effective: results,
          },
        ],
        papers: [
          {
            id: "paper",
            fullMockEligible: true,
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
        wallet: { balance: 10000000, reserved: 0, ledger: [] },
      };
    else if (path.endsWith("/attempt"))
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
        state: "published",
        effective: results,
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
        families: [
          {
            id: family,
            name: "Anderson family",
            learners: [{ id: learner, name: "Oliver" }],
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
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: `test-results/redesign-${name}-${width}.png`,
    fullPage: true,
  });
}
for (const width of [375, 768, 1024, 1440]) {
  test(`student primary flows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await fixture(page);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Back to work." }),
    ).toBeVisible();
    await capture(page, "home", width);
    await page
      .getByRole("button", { name: "Continue revision", exact: true })
      .click();
    await expect(
      page.getByText(questions[0].text, { exact: true }),
    ).toBeVisible();
    const editorBox = await page
      .getByRole("textbox", { name: "Your answer", exact: true })
      .boundingBox();
    const actionBox = await page
      .getByRole("button", { name: "Review before submitting" })
      .boundingBox();
    expect(actionBox!.y).toBeGreaterThan(editorBox!.y + editorBox!.height);
    await capture(page, "question", width);
    await page
      .getByRole("textbox", { name: "Your answer", exact: true })
      .fill("A small sample may not reflect the population.");
    await expect(page.getByRole("status")).toHaveText("Saved to account");
    await page
      .getByRole("button", { name: "Review before submitting" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Back to study", exact: false })
      .click();
    await page.getByRole("button", { name: "Subjects", exact: true }).click();
    await expect(
      page.getByText("Clinical psychology and psychological skills", {
        exact: true,
      }),
    ).toBeVisible();
    await capture(page, "papers", width);
    await page.getByRole("button", { name: "Topics", exact: true }).click();
    await page
      .getByRole("button", { name: "History", exact: true })
      .first()
      .click();
    await expect(page.getByRole("cell", { name: /8\/12/ })).toBeVisible();
    await capture(page, "progress", width);
    await page.getByRole("button", { name: "Answer & feedback" }).click();
    await expect(
      page.getByRole("heading", { name: "Where you lost marks" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Practise this improvement" }),
    ).toBeVisible();
    await capture(page, "results", width);
    await page
      .getByRole("button", { name: "Back", exact: false })
      .first()
      .click();
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await capture(page, "practice", width);
  });
  test(`parent and administration at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await fixture(page, true, true);
    await page.goto("/");
    await page.getByRole("button", { name: "Family", exact: true }).click();
    await page
      .getByText("Weekly availability and confirmed exam dates", {
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Add study time" }).click();
    await expect(page.getByLabel("Start time", { exact: true })).toBeVisible();
    const saved = page.waitForRequest(request => request.url().endsWith("/family/enrolment") && request.method() === "POST");
    await page.getByRole("button", {name: "Save course settings"}).click();
    expect((await saved).postDataJSON().course.availability).toEqual([{day:1,start:"17:00",minutes:20}]);
    await capture(page, "family", width);
    for (const section of [
      "Reviews",
      "Credit",
      "Plan",
      "Families",
      "Invitations",
      "Catalogue",
      "Operations",
    ]) {
      await page.getByRole("button", { name: section, exact: true }).click();
      await expect(page.locator("h1")).toBeVisible();
      await capture(page, section.toLowerCase(), width);
    }
  });
}
