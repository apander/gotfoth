import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { startPractice, freeze } from "../src/server/learning";
import { credit, resumeFundedAssessments } from "../src/server/finance";
import { seedTestFixtures, fixturePaper } from "../src/server/test-fixtures";
import { testFamilyIds, testLearnerId } from "../src/lib/test-accounts";
import type { Tx } from "../src/server/db";

test("all practice modes save unfunded work; only parent funding and limits unlock marking, once", async () => {
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
    const tx = db as unknown as Tx;
    await seedTestFixtures(tx, "unused-test-hash");
    const family = testFamilyIds.Brook,
      learner = testLearnerId(4);
    // Keep pre-existing fixture work separate from the four submissions below.
    await db.query("UPDATE assessments SET state='failed' WHERE family_id=$1", [
      family,
    ]);
    const ids: string[] = [];
    for (const mode of ["guided", "independent", "timed", "mock"]) {
      const id = randomUUID();
      ids.push(id);
      const paper = fixturePaper("psychology");
      const data = {
        questions: [paper.questions[0]],
        resources: [],
        generalRubrics: [],
        choices: [],
        selected: [],
        durationMinutes: 20,
        extraTimePercent: 25,
        subject: "psychology",
      };
      await db.query(
        "INSERT INTO attempts(id,family_id,learner_id,mode,data) VALUES($1,$2,$3,$4,$5)",
        [id, family, learner, mode, JSON.stringify(data)],
      );
      const draft = (
        await db.query<any>("SELECT * FROM attempts WHERE id=$1", [id])
      ).rows[0];
      const started = await startPractice(tx, draft);
      assert.ok(started.editorToken);
      const active = (
        await db.query<any>("SELECT * FROM attempts WHERE id=$1", [id])
      ).rows[0];
      assert.equal(active.state, "in_progress");
      assert.equal(!!active.deadline, mode === "timed" || mode === "mock");
      if (active.deadline)
        assert.ok(
          (new Date(active.deadline).getTime() -
            new Date(active.started_at).getTime()) /
            1000 >=
            1499,
        );
      await db.query(
        "INSERT INTO answers(attempt_id,family_id,question_id,text,revision) VALUES($1,$2,$3,'My answer is saved without a payment decision',1)",
        [id, family, paper.questions[0].id],
      );
      await freeze(
        tx,
        active,
        "manual",
        mode === "guided" ? paper.questions[0].id : undefined,
      );
      const assessment = (
        await db.query<any>(
          "SELECT r.state,s.answers FROM assessments r JOIN submissions s ON s.id=r.submission_id WHERE s.attempt_id=$1",
          [id],
        )
      ).rows[0];
      assert.equal(assessment.state, "awaiting_funds");
      assert.equal(
        assessment.answers[0].text,
        "My answer is saved without a payment decision",
      );
    }
    assert.equal(
      (
        await db.query("SELECT * FROM reservations WHERE family_id=$1", [
          family,
        ])
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT * FROM outbox WHERE family_id=$1 AND kind='mark'",
          [family],
        )
      ).rows.length,
      0,
    );
    await db.query("UPDATE learners SET monthly_cap=0 WHERE id=$1", [learner]);
    await credit(tx, family, 10000000, "parent-top-up", "parent payment");
    await credit(tx, family, 10000000, "parent-top-up", "parent payment");
    assert.equal(
      Number(
        (
          await db.query<any>(
            "SELECT balance FROM funding_accounts WHERE family_id=$1",
            [family],
          )
        ).rows[0].balance,
      ),
      10000000,
    );
    assert.equal(
      (
        await db.query("SELECT * FROM reservations WHERE family_id=$1", [
          family,
        ])
      ).rows.length,
      0,
    );
    await db.query("UPDATE learners SET monthly_cap=10000000 WHERE id=$1", [
      learner,
    ]);
    assert.equal(await resumeFundedAssessments(tx, family, learner), 4);
    assert.equal(await resumeFundedAssessments(tx, family, learner), 0);
    assert.equal(
      (
        await db.query("SELECT * FROM reservations WHERE family_id=$1", [
          family,
        ])
      ).rows.length,
      4,
    );
    assert.equal(
      (
        await db.query(
          "SELECT * FROM outbox WHERE family_id=$1 AND kind='mark'",
          [family],
        )
      ).rows.length,
      4,
    );
    const state = await db.query<any>(
      "SELECT r.state FROM assessments r JOIN submissions s ON s.id=r.submission_id WHERE s.attempt_id=ANY($1::uuid[])",
      [ids],
    );
    assert.ok(state.rows.every((r) => r.state === "queued"));
    assert.equal(await resumeFundedAssessments(tx, testFamilyIds.River), 0);
  } finally {
    await db.close();
  }
});
