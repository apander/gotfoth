import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import {
  testAccounts,
  isTestAccount,
  testFamilyIds,
  isTestPractice,
} from "../src/lib/test-accounts";
import {
  seedTestFixtures,
  fixturePaper,
  fixtureRate,
} from "../src/server/test-fixtures";
import { markAnswer } from "../src/server/marking";
import { validateResult } from "../src/lib/domain";
import type { Tx } from "../src/server/db";
import { catalogue } from "../src/server/learning";
test("test accounts and simulated practice stay separate from normal accounts and questions", () => {
  assert.equal(isTestAccount("alex@ux.gotfoth.test"), true);
  assert.equal(isTestAccount("alasdair.anderson@gmail.com"), false);
  assert.equal(isTestAccount("system@ux.gotfoth.test"), false);
  const questions = fixturePaper("psychology").questions;
  assert.equal(isTestPractice(testFamilyIds.River, questions), true);
  assert.equal(isTestPractice(testFamilyIds.River, []), false);
  assert.equal(
    isTestPractice(testFamilyIds.River, [{ id: "real-question" }]),
    false,
  );
  assert.equal(
    isTestPractice("88888888-8888-4888-8888-888888888888", questions),
    false,
  );
});
test("simulated marking works on main without an environment flag and produces valid evidence only for fixture questions", async () => {
  const before = { ...process.env };
  try {
    process.env.VERCEL_ENV = "production";
    process.env.BETTER_AUTH_URL = "https://gotfoth.vercel.app";
    delete process.env.TEST_LOGIN_ENABLED;
    delete process.env.OPENAI_API_KEY;
    const q = fixturePaper("psychology").questions[0],
      answer = "A small sample may not represent the population.";
    const result = await markAnswer(q, answer, {}, fixtureRate);
    validateResult(result.result, q, answer);
    assert.equal(result.cost, 0);
    assert.ok(result.result.uncertainty.length);
    assert.match(result.result.justification, /Simulated/);
    await assert.rejects(
      () => markAnswer({ ...q, id: "real-question" }, answer, {}, fixtureRate),
      /provider is not configured/,
    );
    await assert.rejects(
      () =>
        markAnswer(q, answer, {}, { ...fixtureRate, model: "normal-provider" }),
      /provider is not configured/,
    );
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  }
});
test("fixture seeding is repeatable, supports real review data, and reset preserves non-test families", async () => {
  const db = new PGlite();
  try {
    for (const name of [
      "0000_v2",
      "0001_teacher",
      "0002_superusers",
      "0003_paper_pdf",
      "0004_one_student_family",
      "0005_people_names",
      "0006_persona_goals",
    ])
      await db.exec(
        await readFile(
          new URL(`../drizzle/${name}.sql`, import.meta.url),
          "utf8",
        ),
      );
    const hash = await hashPassword("fixture-test-password-only");
    await db.query(
      "INSERT INTO families(id,name) VALUES('88888888-8888-4888-8888-888888888888','Existing real family')",
    );
    await db.query(
      "INSERT INTO rate_cards(id,data,active) VALUES('88888888-8888-4888-8888-888888888887',$1,true)",
      [
        JSON.stringify({
          ...fixtureRate,
          label: "Existing rate",
          model: "normal-provider",
        }),
      ],
    );
    const seed = (reset = false) =>
      db.transaction((tx) =>
        seedTestFixtures(tx as unknown as Tx, hash, reset),
      );
    const result = await seed();
    assert.equal(result.accounts, 12);
    assert.equal(result.families, 4);
    await seed();
    assert.equal(
      (await db.query<{ id: string }>("SELECT id FROM rate_cards WHERE active"))
        .rows[0].id,
      "88888888-8888-4888-8888-888888888887",
    );
    assert.equal(
      (await catalogue(db as unknown as Tx, testFamilyIds.River)).length,
      4,
    );
    assert.equal(
      (
        await catalogue(
          db as unknown as Tx,
          "88888888-8888-4888-8888-888888888888",
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM families",
        )
      ).rows[0].count,
      5,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM memberships WHERE user_id='ux-fixture-morgan'",
        )
      ).rows[0].count,
      2,
    );
    const stored = (
      await db.query<{ password: string }>(
        "SELECT password FROM account WHERE id='ux-password-alex'",
      )
    ).rows[0].password;
    assert.equal(
      await verifyPassword({
        hash: stored,
        password: "fixture-test-password-only",
      }),
      true,
    );
    const review = (
      await db.query<{ candidates: any[] }>(
        "SELECT candidates FROM assessments WHERE state='needs_review' LIMIT 1",
      )
    ).rows[0];
    assert.equal(review.candidates.length, 2);
    await db.query(
      "INSERT INTO ledger(id,family_id,learner_id,amount,kind,idempotency_key,reference) SELECT '77777777-7777-4777-8777-777777777777',family_id,id,0,'marking','ux-regression-settle','Published test assessment' FROM learners WHERE email='alex@ux.gotfoth.test'",
    );
    await db.query(
      "UPDATE funding_accounts SET balance=123 WHERE family_id=$1",
      [testFamilyIds.River],
    );
    await seed(true);
    assert.equal(
      (
        await db.query<{ balance: number }>(
          "SELECT balance FROM funding_accounts WHERE family_id=$1",
          [testFamilyIds.River],
        )
      ).rows[0].balance,
      25000000,
    );
    assert.equal(
      (
        await db.query<{ name: string }>(
          "SELECT name FROM families WHERE id='88888888-8888-4888-8888-888888888888'",
        )
      ).rows[0].name,
      "Existing real family",
    );
    await db.query(
      "INSERT INTO memberships(user_id,family_id,role) VALUES('ux-fixture-jordan','88888888-8888-4888-8888-888888888888','parent')",
    );
    await assert.rejects(() => seed(true), /non-fixture family/);
    assert.equal(testAccounts.filter((a) => a.role === "teacher").length, 2);
  } finally {
    await db.close();
  }
});
