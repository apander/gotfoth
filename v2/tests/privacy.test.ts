import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { purgeFamily } from "../src/server/privacy";
import type { Tx } from "../src/server/db";
test("purge removes learning records but preserves pseudonymous financial amounts", async () => {
  const db = new PGlite();
  await db.exec(
    await readFile(new URL("../drizzle/0000_v2.sql", import.meta.url), "utf8"),
  );
  const family = randomUUID(),
    learner = randomUUID(),
    attempt = randomUUID();
  await db.query("INSERT INTO families(id,name) VALUES($1,$2)", [
    family,
    "Private family",
  ]);
  await assert.rejects(
    () => purgeFamily(db as unknown as Tx, family),
    /explicitly deleted/,
  );
  await db.query("INSERT INTO learners(id,family_id,name) VALUES($1,$2,$3)", [
    learner,
    family,
    "Private student",
  ]);
  await db.query(
    "INSERT INTO attempts(id,family_id,learner_id,mode,data) VALUES($1,$2,$3,'independent','{}')",
    [attempt, family, learner],
  );
  await db.query(
    "INSERT INTO submissions(id,family_id,learner_id,attempt_id,answers,choices,ended_by) VALUES($1,$2,$3,$4,'[]','[]','manual')",
    [randomUUID(), family, learner, attempt],
  );
  await db.query(
    "INSERT INTO ledger(id,family_id,learner_id,amount,kind,idempotency_key,reference) VALUES($1,$2,$3,-123,'marking','unique','retained-reference')",
    [randomUUID(), family, learner],
  );
  await db.query("UPDATE families SET deleted_at=now() WHERE id=$1", [family]);
  await db.exec("BEGIN");
  await purgeFamily(db as unknown as Tx, family);
  await db.exec("COMMIT");
  assert.equal((await db.query("SELECT * FROM submissions")).rows.length, 0);
  assert.equal((await db.query("SELECT * FROM learners")).rows.length, 0);
  const money = (await db.query<any>("SELECT * FROM ledger")).rows[0];
  assert.equal(money.amount, -123);
  assert.equal(money.learner_id, null);
  await assert.rejects(
    () => db.query("UPDATE ledger SET amount=0"),
    /Immutable/,
  );
  await db.close();
});
