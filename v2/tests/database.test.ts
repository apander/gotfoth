import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const db = new PGlite();
test("schema installs; RLS denies cross-family reads and immutable work rejects mutations", async () => {
  await db.exec(
    await readFile(new URL("../drizzle/0000_v2.sql", import.meta.url), "utf8"),
  );
  const f1 = randomUUID(),
    f2 = randomUUID(),
    l1 = randomUUID(),
    l2 = randomUUID(),
    attempt = randomUUID(),
    submission = randomUUID();
  await db.query("INSERT INTO families(id,name) VALUES($1,$2),($3,$4)", [
    f1,
    "One",
    f2,
    "Two",
  ]);
  await db.query(
    "INSERT INTO learners(id,family_id,name) VALUES($1,$2,$3),($4,$5,$6)",
    [l1, f1, "A", l2, f2, "B"],
  );
  await db.query(
    "INSERT INTO attempts(id,family_id,learner_id,mode,data) VALUES($1,$2,$3,'independent','{}')",
    [attempt, f1, l1],
  );
  await db.query(
    "INSERT INTO submissions(id,family_id,learner_id,attempt_id,answers,choices,ended_by) VALUES($1,$2,$3,$4,'[]','[]','manual')",
    [submission, f1, l1, attempt],
  );
  await assert.rejects(
    () =>
      db.query("UPDATE submissions SET answers='[]' WHERE id=$1", [submission]),
    /Immutable/,
  );
  await assert.rejects(
    () =>
      db.query(
        "INSERT INTO submissions(id,family_id,learner_id,attempt_id,answers,choices,ended_by) VALUES($1,$2,$3,$4,'[]','[]','deadline')",
        [randomUUID(), f1, l1, attempt],
      ),
    /unique/,
  );
  await db.exec(
    "CREATE ROLE runtime NOLOGIN; GRANT USAGE ON SCHEMA public TO runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO runtime; SET ROLE runtime;",
  );
  assert.equal((await db.query("SELECT * FROM learners")).rows.length, 0);
  await db.exec("BEGIN");
  await db.query("SELECT set_config('app.family_id',$1,true)", [f1]);
  const rows = await db.query<{ name: string }>("SELECT name FROM learners");
  assert.deepEqual(rows.rows, [{ name: "A" }]);
  await assert.rejects(
    () =>
      db.query("INSERT INTO learners(id,family_id,name) VALUES($1,$2,$3)", [
        randomUUID(),
        f2,
        "Forbidden",
      ]),
    /row-level security/,
  );
  await db.exec("ROLLBACK");
  assert.equal((await db.query("SELECT * FROM learners")).rows.length, 0);
  await db.exec("RESET ROLE");
  await db.close();
});
