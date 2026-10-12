import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { acceptInvitationInTransaction } from "../src/server/admin";
import type { Tx } from "../src/server/db";
test("a teacher membership is allowed and a teacher invitation does not need a learner", async () => {
  const db = new PGlite(),
    tx = db as unknown as Tx;
  await db.exec(
    await readFile(new URL("../drizzle/0000_v2.sql", import.meta.url), "utf8"),
  );
  await db.exec(
    await readFile(new URL("../drizzle/0001_teacher.sql", import.meta.url), "utf8"),
  );
  await db.exec(
    await readFile(new URL("../drizzle/0005_people_names.sql", import.meta.url), "utf8"),
  );
  const family = randomUUID(),
    learner = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$1,$2,true)',
    ["teacher", "teacher@example.test"],
  );
  await db.query("INSERT INTO families(id,name) VALUES($1,$2)", [
    family,
    "Family",
  ]);
  await db.query("INSERT INTO learners(id,family_id,name) VALUES($1,$2,$3)", [
    learner,
    family,
    "Learner",
  ]);
  await db.query(
    "INSERT INTO memberships(user_id,family_id,role,learner_id) VALUES($1,$2,'teacher',NULL)",
    ["teacher", family],
  );
  const allowed = await db.query<{ role: string; learner_id: string | null }>(
    "SELECT role,learner_id FROM memberships WHERE user_id='teacher'",
  );
  assert.equal(allowed.rows[0]?.role, "teacher");
  assert.equal(allowed.rows[0]?.learner_id, null);
  await db.query("DELETE FROM memberships WHERE user_id='teacher'");
  await assert.rejects(
    () =>
      db.query(
        "INSERT INTO memberships(user_id,family_id,role,learner_id) VALUES($1,$2,'teacher',$3)",
        ["teacher", family, learner],
      ),
    /memberships_teacher_learner_check/,
  );
  const token = "teacher-invite";
  await db.query(
    "INSERT INTO invitations(id,token_hash,email,family_id,role,learner_id,expires_at,created_by) VALUES($1,$2,$3,$4,'teacher',NULL,now()+interval '7 days','teacher')",
    [
      randomUUID(),
      createHash("sha256").update(token).digest("hex"),
      "teacher@example.test",
      family,
    ],
  );
  await db.exec("BEGIN");
  const accepted = await acceptInvitationInTransaction(
    tx,
    { id: "teacher", email: "teacher@example.test", emailVerified: true },
    token,
  );
  await db.exec("COMMIT");
  assert.equal(accepted.familyId, family);
  const membership = await db.query(
    "SELECT role,learner_id,active FROM memberships WHERE user_id='teacher' AND family_id=$1",
    [family],
  );
  assert.deepEqual(membership.rows[0], {
    role: "teacher",
    learner_id: null,
    active: true,
  });
  const links = await db.query(
    "SELECT 1 FROM parent_links WHERE user_id='teacher'",
  );
  assert.equal(links.rowCount, 0);
});
