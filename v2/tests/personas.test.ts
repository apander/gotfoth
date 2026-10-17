import test from "node:test";
import assert from "node:assert/strict";
import {
  completionSummary,
  localWeek,
  meaningfulAnswer,
} from "../src/lib/motivation";
import { pageForRole, capabilities } from "../src/lib/personas";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  motivation,
  saveMotivation,
  teacherWorkspace,
} from "../src/server/personas";
import type { Actor, Tx } from "../src/server/db";

test("goals count distinct answered attempts, not marks, blank tables, or repeated question submissions", () => {
  const now = new Date("2026-10-19T00:30:00Z");
  const rows = [
    {
      attempt_id: "one",
      submitted_at: "2026-10-18T23:30:00Z",
      answers: [{ text: "A considered answer" }],
    },
    {
      attempt_id: "one",
      submitted_at: "2026-10-18T23:40:00Z",
      answers: [{ text: "Another answer" }],
    },
    {
      attempt_id: "blank",
      submitted_at: "2026-10-18T23:30:00Z",
      answers: [{ text: '[["", "  "]]' }],
    },
    {
      attempt_id: "last-week",
      submitted_at: "2026-10-17T12:00:00Z",
      answers: [{ text: "0" }],
    },
  ];
  const result = completionSummary(rows, "Europe/Amsterdam", now);
  assert.equal(result.total, 2);
  assert.equal(result.weekly, 1);
  assert.deepEqual(result.milestones, [1]);
  assert.equal(result.latestAttemptId, "one");
  assert.equal(completionSummary(rows, "America/New_York", now).weekly, 2);
  assert.equal(meaningfulAnswer("   "), false);
  assert.equal(meaningfulAnswer('[["0"]]'), true);
  assert.equal(
    localWeek(new Date("2026-03-29T23:30:00Z"), "Europe/Amsterdam"),
    "2026-03-30",
  );
  assert.equal(
    localWeek(new Date("2026-10-25T23:30:00Z"), "Europe/Amsterdam"),
    "2026-10-26",
  );
  assert.deepEqual(
    completionSummary(
      Array.from({ length: 10 }, (_, i) => ({
        attempt_id: String(i),
        submitted_at: now,
        answers: [{ text: "Answer" }],
      })),
      "UTC",
      now,
    ).milestones,
    [1, 5, 10],
  );
});

test("legacy links resolve to permitted persona pages", () => {
  assert.equal(pageForRole("Family", "student"), "Study");
  assert.equal(pageForRole("Catalogue", "superuser"), "Content");
  assert.equal(pageForRole("Guidance", "teacher"), "Overview");
  assert.equal(pageForRole("Reviews", "parent"), "Overview");
  assert.equal(capabilities.parent.query, false);
  assert.equal(capabilities.student.review, false);
});

test("teacher aggregation and goals retain family RLS, membership restrictions and pagination", async () => {
  const db = new PGlite();
  try {
    for (const name of ["0000_v2", "0001_teacher", "0006_persona_goals"])
      await db.exec(
        await readFile(
          new URL(`../drizzle/${name}.sql`, import.meta.url),
          "utf8",
        ),
      );
    const teacher: Actor = {
      id: "teacher",
      email: "teacher@example.test",
      emailVerified: true,
    };
    const student: Actor = {
      id: "student",
      email: "student@example.test",
      emailVerified: true,
    };
    const parent: Actor = {
      id: "parent",
      email: "parent@example.test",
      emailVerified: true,
    };
    for (const actor of [teacher, student, parent])
      await db.query(
        'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$1,$2,true)',
        [actor.id, actor.email],
      );
    const families = [randomUUID(), randomUUID(), randomUUID()];
    const learners = [randomUUID(), randomUUID(), randomUUID()];
    for (let i = 0; i < 3; i++) {
      await db.query("INSERT INTO families(id,name) VALUES($1,$2)", [
        families[i],
        `Family ${i}`,
      ]);
      await db.query(
        "INSERT INTO learners(id,family_id,name) VALUES($1,$2,$3)",
        [learners[i], families[i], `Student ${i}`],
      );
      await db.query(
        "INSERT INTO enrolments(id,family_id,learner_id,data) VALUES($1,$2,$3,$4)",
        [
          randomUUID(),
          families[i],
          learners[i],
          JSON.stringify({ subject: "psychology", targetSession: "June 2027" }),
        ],
      );
      await db.query(
        "INSERT INTO memberships(user_id,family_id,role,active) VALUES('teacher',$1,'teacher',$2)",
        [families[i], i < 2],
      );
      for (let j = 0; j < (i === 0 ? 28 : 1); j++) {
        const attempt = randomUUID(),
          submission = randomUUID();
        await db.query(
          "INSERT INTO attempts(id,family_id,learner_id,mode,state,data) VALUES($1,$2,$3,'independent','submitted',$4)",
          [
            attempt,
            families[i],
            learners[i],
            JSON.stringify({ subject: "psychology" }),
          ],
        );
        await db.query(
          "INSERT INTO submissions(id,family_id,learner_id,attempt_id,answers,choices,ended_by,submitted_at) VALUES($1,$2,$3,$4,$5,'[]','manual',$6)",
          [
            submission,
            families[i],
            learners[i],
            attempt,
            JSON.stringify([{ question_id: "q1", text: "Answer" }]),
            new Date(Date.UTC(2026, 9, j + 1)).toISOString(),
          ],
        );
        await db.query(
          "INSERT INTO assessments(id,family_id,learner_id,submission_id,state) VALUES($1,$2,$3,$4,$5)",
          [
            randomUUID(),
            families[i],
            learners[i],
            submission,
            j === 27 ? "published" : "needs_review",
          ],
        );
      }
    }
    await db.query(
      "INSERT INTO memberships(user_id,family_id,role,learner_id) VALUES('student',$1,'student',$2),('parent',$1,'parent',NULL)",
      [families[0], learners[0]],
    );
    await db.exec(
      "CREATE ROLE persona_runtime NOLOGIN; GRANT USAGE ON SCHEMA public TO persona_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO persona_runtime; SET ROLE persona_runtime;",
    );
    const access = {
      database: () => db as unknown as { query: Tx["query"] },
      family: async <T>(
        actor: Actor,
        familyId: string,
        fn: (tx: Tx, role: string) => Promise<T>,
      ) => {
        await db.exec("BEGIN");
        try {
          await db.query("SELECT set_config('app.family_id',$1,true)", [
            familyId,
          ]);
          const member = (
            await db.query<{ role: string }>(
              "SELECT role FROM memberships WHERE user_id=$1 AND family_id=$2 AND active",
              [actor.id, familyId],
            )
          ).rows[0];
          if (!member) throw new Error("Forbidden");
          const result = await fn(db as unknown as Tx, member.role);
          await db.exec("COMMIT");
          return result;
        } catch (e) {
          await db.exec("ROLLBACK");
          throw e;
        }
      },
    };
    const first = await teacherWorkspace(
      teacher,
      new URLSearchParams({ view: "reviews" }),
      access,
    );
    assert.equal(first.totals.reviews, 28);
    assert.equal(first.reviews.length, 25);
    assert.equal(first.families.length, 2);
    assert.ok(first.reviews.every((r) => r.family_id !== families[2]));
    const second = await teacherWorkspace(
      teacher,
      new URLSearchParams({ view: "reviews", offset: "25" }),
      access,
    );
    assert.equal(second.reviews.length, 3);
    assert.ok(
      second.reviews.every((r) => !first.reviews.some((a) => a.id === r.id)),
    );
    const forbidden = await teacherWorkspace(
      teacher,
      new URLSearchParams({ family: families[2] }),
      access,
    );
    assert.equal(forbidden.reviews.length, 0);
    await assert.rejects(
      () => teacherWorkspace(parent, new URLSearchParams(), access),
      /Teacher access/,
    );
    const detail = await teacherWorkspace(
      teacher,
      new URLSearchParams({
        view: "students",
        learner: learners[0],
        status: "published",
      }),
      access,
    );
    assert.equal(detail.reviews.length, 1);
    assert.equal(detail.reviews[0].state, "published");
    const goal = await saveMotivation(
      student,
      families[0],
      { learnerId: learners[0], goal: 5, timezone: "Europe/Amsterdam" },
      access,
    );
    assert.equal(goal.goal, 5);
    assert.equal(goal.timezone, "Europe/Amsterdam");
    assert.equal(
      (await motivation(student, families[0], learners[0], access)).goal,
      5,
    );
    await assert.rejects(
      () =>
        saveMotivation(
          parent,
          families[0],
          { learnerId: learners[0], goal: 4, timezone: "UTC" },
          access,
        ),
      /Student access/,
    );
    await assert.rejects(() =>
      motivation(student, families[0], learners[1], access),
    );
    await assert.rejects(() =>
      saveMotivation(
        student,
        families[0],
        { learnerId: learners[0], goal: 8, timezone: "UTC" },
        access,
      ),
    );
    await assert.rejects(() =>
      saveMotivation(
        student,
        families[0],
        { learnerId: learners[0], goal: 3, timezone: "Invalid/Zone" },
        access,
      ),
    );
    assert.equal((await db.query("SELECT * FROM learners")).rows.length, 0);
  } finally {
    await db.close();
  }
});
