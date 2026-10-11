import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { runMarking, configurationHash } from "../src/server/marking";
import { type RateCard } from "../src/server/finance";
import { transaction, type Tx } from "../src/server/db";
test("marking checkpoints one answer per job, settles once, and requires evaluation before release", async () => {
  const db = new PGlite();
  await db.exec(
    await readFile(new URL("../drizzle/0000_v2.sql", import.meta.url), "utf8"),
  );
  const scoped: typeof transaction = async (fn, familyId) =>
    db.transaction(async (t) => {
      if (familyId)
        await t.query("SELECT set_config('app.family_id',$1,true)", [familyId]);
      return fn(t as unknown as Tx);
    });
  process.env.GLOBAL_AI_BUDGET_MICROS = "1000000";
  const f = randomUUID(),
    l = randomUUID(),
    a = randomUUID(),
    s = randomUUID(),
    r = randomUUID(),
    quote = randomUUID(),
    card = randomUUID();
  const rate: RateCard = {
    label: "Synthetic test",
    model: "not-called",
    reviewModel: "not-called",
    promptVersion: "test",
    inputMicrosPerMillion: 1000,
    outputMicrosPerMillion: 1000,
    reviewInputMicrosPerMillion: 1000,
    reviewOutputMicrosPerMillion: 1000,
    maxOutputTokens: 500,
    maxAnswerChars: 1000,
    markupBasisPoints: 10000,
  };
  const questions = ["q1", "q2"].map((id) => ({
    id,
    marks: 4,
    topics: ["methods"],
    rubric: {
      id: "rubric-" + id,
      levels: false,
      text: "Credit supported evidence.",
    },
  }));
  await db.query("INSERT INTO families(id,name) VALUES($1,$2)", [
    f,
    "Synthetic",
  ]);
  await db.query("INSERT INTO learners(id,family_id,name) VALUES($1,$2,$3)", [
    l,
    f,
    "Learner",
  ]);
  await db.query(
    "INSERT INTO funding_accounts(family_id,balance) VALUES($1,1000)",
    [f],
  );
  await db.query(
    "INSERT INTO attempts(id,family_id,learner_id,mode,state,data) VALUES($1,$2,$3,'independent','submitted',$4)",
    [
      a,
      f,
      l,
      JSON.stringify({
        questions,
        resources: [],
        generalRubrics: [],
        quoteId: quote,
        choices: [],
        specification: "synthetic-2026",
        assisted: false,
      }),
    ],
  );
  await db.query("INSERT INTO rate_cards(id,data) VALUES($1,$2)", [
    card,
    JSON.stringify(rate),
  ]);
  await db.query(
    "INSERT INTO quotes(id,family_id,learner_id,attempt_id,max_charge,rate_card_id,configuration,expires_at,accepted_at) VALUES($1,$2,$3,$4,100,$5,$6,now(),now())",
    [quote, f, l, a, card, JSON.stringify(rate)],
  );
  await db.query(
    "INSERT INTO reservations(id,family_id,learner_id,quote_id,amount,month) VALUES($1,$2,$3,$4,100,'2026-10')",
    [randomUUID(), f, l, quote],
  );
  await db.query(
    "INSERT INTO submissions(id,family_id,learner_id,attempt_id,answers,choices,ended_by) VALUES($1,$2,$3,$4,$5,'[]','manual')",
    [
      s,
      f,
      l,
      a,
      JSON.stringify(
        questions.map((q) => ({ question_id: q.id, text: "", revision: 0 })),
      ),
    ],
  );
  await db.query(
    "INSERT INTO assessments(id,family_id,learner_id,submission_id,state) VALUES($1,$2,$3,$4,'queued')",
    [r, f, l, s],
  );
  await runMarking(f, r, scoped);
  let state = (await db.query<any>("SELECT * FROM assessments")).rows[0];
  assert.equal(state.state, "queued");
  assert.equal(state.candidates.length, 1);
  await runMarking(f, r, scoped);
  state = (await db.query<any>("SELECT * FROM assessments")).rows[0];
  assert.equal(state.state, "needs_review");
  assert.equal(state.candidates.length, 2);
  assert.equal(state.effective, null);
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$1,$2,true)',
    ["admin", "admin@example.test"],
  );
  await db.query(
    "INSERT INTO course_evaluations(id,specification,configuration_hash,passed,evidence,approved_by) VALUES($1,'synthetic-2026',$2,true,'{}','admin')",
    [randomUUID(), configurationHash(rate)],
  );
  await db.query("UPDATE assessments SET state='queued' WHERE id=$1", [r]);
  await runMarking(f, r, scoped);
  await runMarking(f, r, scoped);
  state = (await db.query<any>("SELECT * FROM assessments")).rows[0];
  assert.equal(state.state, "published");
  assert.equal(state.effective.length, 2);
  assert.equal((await db.query("SELECT * FROM ledger")).rows.length, 1);
  assert.equal(
    (await db.query<any>("SELECT * FROM funding_accounts")).rows[0].balance,
    1000,
  );
  assert.equal(
    (await db.query<any>("SELECT * FROM operator_budget")).rows[0].reserved,
    0,
  );
  await db.close();
});
