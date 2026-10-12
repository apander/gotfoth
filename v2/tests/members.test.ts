import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setMemberInTransaction } from "../src/server/admin";
import type { Tx } from "../src/server/db";

test("a parent can become a teacher, and a student stays in one family", async () => {
  const db = new PGlite();
  const tx = db as unknown as Tx;
  for (const file of ["0000_v2.sql", "0001_teacher.sql", "0002_superusers.sql", "0005_people_names.sql"])
    await db.exec(await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
  const operators = await db.query("SELECT email FROM superusers ORDER BY email");
  assert.deepEqual(
    operators.rows.map((row) => (row as { email: string }).email),
    ["alasdair.anderson@gmail.com", "ilovethedoos@gmail.com"],
  );
  const family = randomUUID();
  const learner = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$1,$2,true),($3,$3,$4,true)',
    ["parent", "parent@example.test", "operator", "operator@example.test"],
  );
  await db.query("INSERT INTO families(id,name) VALUES($1,'Family')", [family]);
  await db.query("INSERT INTO learners(id,family_id,name) VALUES($1,$2,'Learner')", [
    learner,
    family,
  ]);
  await db.query(
    "INSERT INTO memberships(user_id,family_id,role,learner_id) VALUES('parent',$1,'parent',NULL)",
    [family],
  );
  await db.query(
    "INSERT INTO parent_links(user_id,family_id,learner_id) VALUES('parent',$1,$2)",
    [family, learner],
  );
  await db.exec("BEGIN");
  const saved = await setMemberInTransaction(
    tx,
    { id: "operator", email: "operator@example.test", emailVerified: true },
    { action: "set", familyId: family, email: "parent@example.test", role: "teacher" },
  );
  await db.exec("COMMIT");
  assert.deepEqual(saved, { saved: true });
  const membership = await db.query(
    "SELECT role,learner_id FROM memberships WHERE user_id='parent'",
  );
  const row = membership.rows[0] as { role: string; learner_id: string | null };
  assert.equal(row.role, "teacher");
  assert.equal(row.learner_id, null);
  const links = await db.query("SELECT 1 FROM parent_links WHERE user_id='parent'");
  assert.equal(links.rows.length, 0);
  const other = randomUUID();
  const otherLearner = randomUUID();
  await db.query("INSERT INTO families(id,name) VALUES($1,'Other')", [other]);
  await db.query("INSERT INTO learners(id,family_id,name) VALUES($1,$2,'Other student')", [
    otherLearner,
    other,
  ]);
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$1,$2,true)',
    ["student", "student@example.test"],
  );
  await db.query(
    "INSERT INTO memberships(user_id,family_id,role,learner_id) VALUES('student',$1,'student',$2)",
    [family, learner],
  );
  await db.exec("BEGIN");
  await assert.rejects(
    () =>
      setMemberInTransaction(
        tx,
        { id: "operator", email: "operator@example.test", emailVerified: true },
        {
          action: "set",
          familyId: other,
          email: "student@example.test",
          role: "student",
          learnerId: otherLearner,
        },
      ),
    (error: unknown) =>
      error instanceof Error && error.message === "A student belongs to one family.",
  );
  await db.exec("ROLLBACK");
});
