import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { freeze } from "../src/server/learning";
import type { Tx } from "../src/server/db";
test("manual submission and expiry converge; late writes cannot replace the frozen revision", async () => {
  const db = new PGlite();
  await db.exec(
    await readFile(new URL("../drizzle/0000_v2.sql", import.meta.url), "utf8"),
  );
  const family = randomUUID(),
    learner = randomUUID(),
    id = randomUUID(),
    quoteId = randomUUID(),
    rateId = randomUUID();
  await db.query("INSERT INTO families(id,name) VALUES($1,$2)", [
    family,
    "Family",
  ]);
  await db.query("INSERT INTO learners(id,family_id,name) VALUES($1,$2,$3)", [
    learner,
    family,
    "Learner",
  ]);
  const data = {
    quoteId,
    questions: [{ id: "q1" }],
    choices: [],
    selected: [],
  };
  await db.query(
    "INSERT INTO attempts(id,family_id,learner_id,mode,state,data,deadline) VALUES($1,$2,$3,'mock','in_progress',$4,now())",
    [id, family, learner, JSON.stringify(data)],
  );
  await db.query(
    "INSERT INTO answers(attempt_id,family_id,question_id,text,revision) VALUES($1,$2,'q1','On-time text',2)",
    [id, family],
  );
  await db.query(
    "INSERT INTO funding_accounts(family_id,balance) VALUES($1,100)",
    [family],
  );
  await db.query("INSERT INTO rate_cards(id,data) VALUES($1,'{}')", [rateId]);
  await db.query(
    "INSERT INTO quotes(id,family_id,learner_id,attempt_id,max_charge,rate_card_id,configuration,expires_at,accepted_at) VALUES($1,$2,$3,$4,10,$5,'{}',now()+interval '1 hour',now())",
    [quoteId, family, learner, id, rateId],
  );
  const a = (await db.query("SELECT * FROM attempts WHERE id=$1", [id]))
    .rows[0];
  const first = await freeze(db as unknown as Tx, a, "deadline");
  const second = await freeze(db as unknown as Tx, a, "manual");
  assert.equal(first, second);
  await db.query(
    "UPDATE answers SET text='Late recovery',revision=3 WHERE attempt_id=$1",
    [id],
  );
  const saved = (await db.query<any>("SELECT * FROM submissions")).rows[0];
  assert.equal(saved.answers[0].text, "On-time text");
  assert.equal(saved.ended_by, "deadline");
  assert.equal((await db.query("SELECT * FROM outbox")).rows.length, 1);
  const stale = await db.query(
    "UPDATE answers SET text=$2 WHERE attempt_id=$1 AND revision=2 RETURNING question_id",
    [id, "Stale overwrite"],
  );
  assert.equal(stale.rows.length, 0);
  await db.close();
});
