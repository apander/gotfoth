import { test, expect, type Page } from "@playwright/test";
import {
  testAccounts,
  testFamilyIds,
  testLearnerId,
} from "../src/lib/test-accounts";
import { fixtureId } from "../src/server/test-fixtures";
const base = process.env.TEST_BASE_URL ?? "https://gotfoth.vercel.app";
test.describe("live test workspaces", () => {
  test.skip(
    process.env.RUN_LIVE_TESTS !== "true",
    "Opt in to tests that modify the seeded fictional families with RUN_LIVE_TESTS=true.",
  );
  test.describe.configure({ mode: "serial" });
  async function post(page: Page, path: string, data: object) {
    return page.request.post(path, { headers: { origin: base }, data });
  }
  async function login(page: Page, key: string) {
    const account = testAccounts.find((a) => a.key === key)!;
    await post(page, "/api/auth/sign-out", {});
    const response = await post(page, "/api/auth/sign-in/test", {
      email: account.email,
    });
    expect(response.status()).toBe(200);
    return account;
  }
  test("test workspaces are discoverable from the main sign-in screen", async ({
    page,
  }) => {
    const enabled = await page.request.get("/api/testing");
    expect(enabled.status()).toBe(200);
    expect(await enabled.json()).toEqual({ enabled: true });
    await page.goto("/");
    await page
      .getByRole("link", {
        name: "Open test workspaces · no Google account needed",
      })
      .click();
    await expect(page).toHaveURL(new URL("/testing", base).toString());
    await expect(
      page.getByRole("heading", { name: "Choose a person. Try their day." }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Sign in as/ })).toHaveCount(
      testAccounts.length,
    );
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Sign in as Alex", exact: true }),
    ).toBeEnabled();
  });
  for (const key of ["alex", "jordan", "morgan", "avery"])
    test(`test picker opens ${key} without Google`, async ({ page }) => {
      await page.goto("/testing");
      const account = testAccounts.find((a) => a.key === key)!;
      await page
        .getByRole("button", {
          name: `Sign in as ${account.name.split(" ")[0]}`,
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(
        (url) => url.pathname === "/" && url.origin === new URL(base).origin,
      );
      await expect(page.getByLabel("Test workspace tools")).toBeVisible();
      if (key === "alex")
        await expect(
          page.getByRole("heading", { name: "Your next step, Alex." }),
        ).toBeVisible();
      if (key === "jordan")
        await expect(
          page.getByRole("heading", { name: "A window into their week." }),
        ).toBeVisible();
      if (key === "morgan")
        await expect(
          page.getByRole("heading", { name: "Attention queue", exact: true }),
        ).toBeVisible();
      if (key === "avery") {
        await page
          .getByRole("combobox", { name: "Workspace", exact: true })
          .selectOption(testFamilyIds.River);
        await expect(
          page.getByRole("heading", { name: "A window into their week." }),
        ).toBeVisible();
      }
      if (key === "alex")
        await expect(
          page.getByRole("progressbar", { name: "Weekly practice goal" }),
        ).toBeVisible();
      await page.screenshot({
        path: `test-results/live-test-${key}.png`,
        fullPage: true,
      });
    });
  test("every seeded login has only its configured memberships", async ({
    page,
  }) => {
    test.setTimeout(90000);
    for (const a of testAccounts) {
      await login(page, a.key);
      const identity = await (
        await page.request.get("/api/v2/identity")
      ).json();
      expect(identity.user.email).toBe(a.email);
      expect(identity.superuser).toBe(false);
      expect(identity.workspaces.length).toBeGreaterThan(0);
      if (a.role !== "mixed")
        expect(identity.workspaces.every((w: any) => w.role === a.role)).toBe(
          true,
        );
    }
  });
  test("non-test accounts, password sign-in, signup, and cross-family reads stay blocked", async ({
    page,
  }) => {
    expect(
      (
        await page.request.post("/api/testing", {
          headers: { origin: "https://unrelated.example.test" },
          data: {
            action: "credit",
            familyId: testFamilyIds.River,
            requestId: crypto.randomUUID(),
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(page, "/api/auth/sign-in/email", {
          email: "alex@ux.gotfoth.test",
          password: "definitely-wrong-password",
        })
      ).status(),
    ).not.toBe(200);
    expect(
      (
        await post(page, "/api/auth/sign-in/test", {
          email: "alasdair.anderson@gmail.com",
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(page, "/api/auth/sign-in/test", {
          email: "system@ux.gotfoth.test",
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(page, "/api/auth/sign-in/test", {
          email: "unknown@ux.gotfoth.test",
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/auth/sign-in/test", {
          headers: { origin: "https://unrelated.example.test" },
          data: { email: "alex@ux.gotfoth.test" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.get(
          "/api/auth/sign-in/test?email=alex%40ux.gotfoth.test",
        )
      ).status(),
    ).not.toBe(200);
    expect(
      (
        await post(page, "/api/auth/sign-up/email", {
          email: "outsider@ux.gotfoth.test",
          password: "not-a-real-password",
          name: "Outside",
        })
      ).status(),
    ).not.toBe(200);
    await login(page, "alex");
    expect(
      (
        await page.request.get(
          `/api/v2/family/snapshot?family=${testFamilyIds.Hill}`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await post(page, "/api/testing", {
          action: "credit",
          familyId: testFamilyIds.River,
          requestId: crypto.randomUUID(),
        })
      ).status(),
    ).toBe(403);
  });
  test("new student can save course setup using the seeded test family", async ({
    page,
  }) => {
    await login(page, "casey");
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
    await dialog
      .getByRole("checkbox", { name: "Research methods", exact: true })
      .check();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Add Psychology", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    const snapshot = await (
      await page.request.get(
        `/api/v2/family/snapshot?family=${testFamilyIds.Green}`,
      )
    ).json();
    expect(snapshot.enrolments).toHaveLength(1);
  });
  test("funding, submission, simulated processing, teacher publication and parent reading form a complete workflow", async ({
    page,
  }) => {
    test.setTimeout(90000);
    const familyId = testFamilyIds.Brook,
      learnerId = testLearnerId(4);
    await login(page, "pat");
    const before = await (
      await page.request.get(`/api/v2/family/snapshot?family=${familyId}`)
    ).json();
    const previousCap = Number(
      before.learners.find((item: any) => item.id === learnerId).monthly_cap,
    );
    const originalBalance = Number(before.wallet.balance);
    expect(
      (
        await post(page, "/api/v2/family/action", {
          familyId,
          action: "cap",
          learnerId,
          micros: 0,
        })
      ).status(),
    ).toBe(200);
    await login(page, "taylor");
    const created = await post(page, "/api/v2/family/attempt/create", {
      familyId,
      learnerId,
      enrolmentId: fixtureId("course-taylor-psychology"),
      mode: "timed",
    });
    expect(created.status()).toBe(200);
    const { id } = await created.json();
    const start = await post(page, "/api/v2/family/attempt/action", {
      familyId,
      id,
      action: "start",
    });
    expect(start.status()).toBe(200);
    const { editorToken } = await start.json();
    const attempt = await (
      await page.request.get(
        `/api/v2/family/attempt?family=${familyId}&id=${id}`,
      )
    ).json();
    expect(
      (
        await post(page, "/api/v2/family/attempt/action", {
          familyId,
          id,
          action: "save",
          questionId: attempt.data.questions[0].id,
          text: "A broader sample can better represent the wider population.",
          revision: 0,
          editorToken,
        })
      ).status(),
    ).toBe(200);
    const submitted = await post(page, "/api/v2/family/attempt/action", {
      familyId,
      id,
      action: "submit",
      editorToken,
    });
    expect(submitted.status()).toBe(200);
    const { submission } = await submitted.json();
    const pending = await (
      await page.request.get(
        `/api/v2/family/assessment?family=${familyId}&id=${submission}`,
      )
    ).json();
    expect(pending.state).toBe("awaiting_funds");
    await login(page, "pat");
    const requestId = crypto.randomUUID();
    expect(
      (
        await post(page, "/api/testing", {
          action: "credit",
          familyId,
          requestId,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await post(page, "/api/testing", {
          action: "credit",
          familyId,
          requestId,
        })
      ).status(),
    ).toBe(200);
    const wallet = await (
      await page.request.get(`/api/v2/family/snapshot?family=${familyId}`)
    ).json();
    expect(Number(wallet.wallet.balance)).toBe(originalBalance + 10000000);
    expect(
      (
        await post(page, "/api/v2/family/action", {
          familyId,
          action: "cap",
          learnerId,
          micros: Math.max(previousCap, 10000000),
        })
      ).status(),
    ).toBe(200);
    const resumed = await (
      await page.request.get(
        `/api/v2/family/assessment?family=${familyId}&id=${submission}`,
      )
    ).json();
    expect(resumed.state).toBe("queued");
    await login(page, "lee");
    const processing = await post(page, "/api/testing", {
      action: "process",
      requestId: crypto.randomUUID(),
    });
    expect(processing.status()).toBe(200);
    const detail = await (
      await page.request.get(
        `/api/v2/family/assessment?family=${familyId}&id=${submission}`,
      )
    ).json();
    expect(detail.state).toBe("needs_review");
    const publish = await post(page, "/api/v2/family/review", {
      familyId,
      assessmentId: detail.id,
      action: "publish",
      reason: "Verified the synthetic evidence against the test rubric.",
      results: detail.candidates.map((c: any) => c.primary),
    });
    expect(publish.status()).toBe(200);
    await login(page, "pat");
    const published = await (
      await page.request.get(
        `/api/v2/family/assessment?family=${familyId}&id=${detail.id}`,
      )
    ).json();
    expect(published.state).toBe("published");
    expect(published.candidates).toBeUndefined();
    expect(
      (
        await post(page, "/api/v2/family/review", {
          familyId,
          assessmentId: detail.id,
          action: "query",
          reason: "Parent should remain read-only.",
        })
      ).status(),
    ).toBe(403);
  });
  test("exam example opens real source tabs and preserves writing in the exam desk", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1366, height: 650 });
    await page.goto("/testing");
    await page
      .getByRole("button", { name: "Open exam example as Alex", exact: true })
      .click();
    await page.waitForURL(/attempt=/, { timeout: 45000 });
    const source = page.getByRole("region", {
      name: "Source desk",
      exact: true,
    });
    await expect(
      page
        .getByText(
          "Using Study A, explain one limitation of the sampling method used by the researcher.",
        )
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(
      source.getByText("Twelve volunteers", { exact: false }),
    ).toBeVisible();
    await source
      .getByRole("tab", {
        name: "Table 1 · Reported stress (synthetic data)",
        exact: true,
      })
      .click();
    await expect(
      source.getByRole("cell", { name: "12", exact: true }),
    ).toBeVisible();
    await source
      .getByRole("button", { name: "Pin table", exact: true })
      .click();
    await source
      .getByRole("tab", {
        name: "Study A · fictional psychology study",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Start practice →", exact: true })
      .click();
    const editor = page.getByRole("textbox", {
      name: "Your answer",
      exact: true,
    });
    await expect(editor).toBeEditable();
    await expect(editor).toHaveAttribute("spellcheck", "false");
    const writing =
      "The twelve volunteers came from one psychology class. They may differ from other sixth-form students, so the findings may not generalise to the wider school.";
    await editor.fill(writing);
    await expect(page.locator(".exam-save-row [role=status]")).toHaveText(
      "Saved to account",
    );
    await page
      .getByRole("button", { name: "Next question →", exact: true })
      .click();
    await expect(
      page
        .getByText(
          "Using Study A, explain how the researcher could improve the reliability of the interviews.",
        )
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(
      source.getByRole("tab", {
        name: "Pinned · Table 1 · Reported stress (synthetic data)",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(editor).toHaveValue(writing);
    await page.reload();
    await expect(editor).toHaveValue(writing);
    await expect(
      source.getByRole("tab", {
        name: "Pinned · Table 1 · Reported stress (synthetic data)",
        exact: true,
      }),
    ).toBeVisible();
    await source
      .getByRole("tab", {
        name: "Pinned · Table 1 · Reported stress (synthetic data)",
        exact: true,
      })
      .click();
    await expect(
      source.getByRole("cell", { name: "12", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: "test-results/live-exam-desk-desktop.png",
      fullPage: true,
    });
    console.log("Verified exam desk: " + page.url());
    await page.setViewportSize({ width: 375, height: 850 });
    await expect(source).toBeVisible();
    await page.getByRole("tab", { name: "Answer", exact: true }).click();
    await expect(editor).toHaveValue(writing);
    await expect(
      page.getByRole("button", { name: "Review before submitting" }),
    ).toBeInViewport();
    await page.screenshot({
      path: "test-results/live-exam-desk-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await login(page, "jordan");
    const forbidden = await post(page, "/api/testing", {
      action: "exam",
      requestId: crypto.randomUUID(),
    });
    expect(forbidden.status()).toBe(403);
  });
});
