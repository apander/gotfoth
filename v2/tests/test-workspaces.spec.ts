import { test, expect, type Page } from "@playwright/test";
import {
  testAccounts,
  testFamilyIds,
  testLearnerId,
} from "../src/lib/test-accounts";
import { fixtureId } from "../src/server/test-fixtures";
const password = process.env.TEST_WORKSPACES_PASSWORD;
const base = process.env.TEST_BASE_URL ?? "";
test.describe("real preview test workspaces", () => {
  test.skip(!password, "Requires the isolated preview and its test password.");
  test.describe.configure({ mode: "serial" });
  async function post(page: Page, path: string, data: object) {
    return page.request.post(path, { headers: { origin: base }, data });
  }
  async function login(page: Page, key: string) {
    const account = testAccounts.find((a) => a.key === key)!;
    await post(page, "/api/auth/sign-out", {});
    const response = await post(page, "/api/auth/sign-in/email", {
      email: account.email,
      password,
    });
    expect(response.status()).toBe(200);
    return account;
  }
  for (const key of ["alex", "jordan", "morgan", "avery"])
    test(`test picker opens ${key} without Google`, async ({ page }) => {
      await page.goto("/testing");
      await page.getByLabel("Shared test password").fill(password!);
      const account = testAccounts.find((a) => a.key === key)!;
      await page
        .getByRole("button", {
          name: `Sign in as ${account.name.split(" ")[0]}`,
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === "/" &&
          url.hostname === "gotfoth-persona-preview.vercel.app",
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
  test("wrong password, real accounts, signup, and cross-family reads stay blocked", async ({
    page,
  }) => {
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
        await post(page, "/api/auth/sign-in/email", {
          email: "alasdair.anderson@gmail.com",
          password,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(page, "/api/auth/sign-up/email", {
          email: "outsider@ux.gotfoth.test",
          password,
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
  test("new student can save course setup using real preview data", async ({
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
    await login(page, "taylor");
    const created = await post(page, "/api/v2/family/attempt/create", {
      familyId,
      learnerId,
      enrolmentId: fixtureId("course-taylor-psychology"),
      mode: "timed",
    });
    expect(created.status()).toBe(200);
    const { id } = await created.json();
    const quote = await (
      await post(page, "/api/v2/family/attempt/action", {
        familyId,
        id,
        action: "quote",
      })
    ).json();
    const refused = await post(page, "/api/v2/family/attempt/action", {
      familyId,
      id,
      action: "start",
      quoteId: quote.id,
    });
    expect(refused.status()).not.toBe(200);
    expect((await refused.json()).error.code).toBe("AWAITING_FUNDS");
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
    expect(Number(wallet.wallet.balance)).toBe(10000000);
    await login(page, "taylor");
    const start = await post(page, "/api/v2/family/attempt/action", {
      familyId,
      id,
      action: "start",
      quoteId: quote.id,
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
});
