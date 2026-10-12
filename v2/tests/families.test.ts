import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { saveFamilyInTransaction } from "../src/server/admin";
import { AppError } from "../src/lib/errors";
import type { Tx } from "../src/server/db";

const actor = {
  id: "operator",
  email: "operator@example.test",
  emailVerified: true,
};

test("a family can be added, renamed, and deleted without a restore check", async () => {
  const db = new PGlite();
  const tx = db as unknown as Tx;
  for (const file of ["0000_v2.sql", "0001_teacher.sql", "0005_people_names.sql"])
    await db.exec(
      await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8"),
    );
  const anderson = randomUUID();
  const review = randomUUID();
  await db.exec("BEGIN");
  await saveFamilyInTransaction(
    tx,
    actor,
    { action: "create", name: "Anderson", learners: [{ name: "Oliver", email: "oliver@britams.nl" }] },
    anderson,
  );
  await saveFamilyInTransaction(
    tx,
    actor,
    { action: "create", name: "Paper review", learners: [{ name: "Sample" }] },
    review,
  );
  await db.exec("COMMIT");
  const created = await db.query<{ id: string; name: string; email: string }>(
    "SELECT id,name,email FROM learners WHERE family_id=$1",
    [anderson],
  );
  assert.equal(created.rows[0].name, "Oliver");
  assert.equal(created.rows[0].email, "oliver@britams.nl");
  await db.exec("BEGIN");
  await saveFamilyInTransaction(
    tx,
    actor,
    {
      action: "update",
      id: anderson,
      name: "Anderson",
      suspended: false,
      learners: [{ id: created.rows[0].id, name: "Oliver Anderson" }],
    },
    anderson,
  );
  await db.exec("COMMIT");
  const renamed = await db.query<{ name: string }>(
    "SELECT name FROM learners WHERE id=$1",
    [created.rows[0].id],
  );
  assert.equal(renamed.rows[0].name, "Oliver Anderson");
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$1,$2,true)',
    ["student", "student@example.test"],
  );
  await db.query(
    "INSERT INTO attempts(id,family_id,learner_id,mode,state,data) VALUES($1,$2,$3,'guided','draft','{}')",
    [randomUUID(), anderson, created.rows[0].id],
  );
  await db.exec("BEGIN");
  await assert.rejects(
    () =>
      saveFamilyInTransaction(
        tx,
        actor,
        {
          action: "update",
          id: anderson,
          name: "Anderson",
          suspended: false,
          learners: [],
        },
        anderson,
      ),
    (error: unknown) =>
      error instanceof AppError && error.message.includes("Oliver Anderson"),
  );
  await db.exec("ROLLBACK");
  await db.exec("BEGIN");
  await saveFamilyInTransaction(
    tx,
    actor,
    { action: "delete", id: review },
    review,
  );
  await db.exec("COMMIT");
  const removed = await db.query<{ deleted_at: string | null }>(
    "SELECT deleted_at FROM families WHERE id=$1",
    [review],
  );
  assert.ok(removed.rows[0].deleted_at);
});
