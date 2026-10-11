import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { reserve, settle, credit, release } from "../src/server/finance";
import type { Tx } from "../src/server/db";
test("wallet reservations enforce family credit, cap and single settlement", async () => {
  const db = new PGlite();
  await db.exec(
    await readFile(new URL("../drizzle/0000_v2.sql", import.meta.url), "utf8"),
  );
  const tx = db as unknown as Tx;
  const family = randomUUID(),
    learner = randomUUID(),
    attempt = randomUUID(),
    rate = randomUUID(),
    q1 = randomUUID(),
    q2 = randomUUID();
  await db.query("INSERT INTO families(id,name) VALUES($1,$2)", [
    family,
    "Test",
  ]);
  await db.query(
    "INSERT INTO learners(id,family_id,name,monthly_cap) VALUES($1,$2,$3,80)",
    [learner, family, "Student"],
  );
  await db.query("INSERT INTO funding_accounts(family_id) VALUES($1)", [
    family,
  ]);
  await credit(tx, family, 100, "paid-once", "payment");
  await credit(tx, family, 100, "paid-once", "payment");
  assert.equal(
    (
      await db.query<{ balance: number }>(
        "SELECT balance FROM funding_accounts",
      )
    ).rows[0].balance,
    100,
  );
  await db.query(
    "INSERT INTO attempts(id,family_id,learner_id,mode,data) VALUES($1,$2,$3,'independent','{}')",
    [attempt, family, learner],
  );
  await db.query("INSERT INTO rate_cards(id,data) VALUES($1,'{}')", [rate]);
  for (const id of [q1, q2])
    await db.query(
      "INSERT INTO quotes(id,family_id,learner_id,attempt_id,max_charge,rate_card_id,configuration,expires_at) VALUES($1,$2,$3,$4,60,$5,'{}',now()+interval '1 hour')",
      [id, family, learner, attempt, rate],
    );
  const first = await reserve(tx, q1);
  assert.equal((await reserve(tx, q1)).id, first.id);
  await assert.rejects(() => reserve(tx, q2), /credit/);
  await credit(tx, family, 100, "another-payment", "payment");
  await assert.rejects(() => reserve(tx, q2), /spending cap/);
  await settle(tx, q1, 20);
  await settle(tx, q1, 20);
  assert.equal(
    (
      await db.query<{ balance: number }>(
        "SELECT balance FROM funding_accounts",
      )
    ).rows[0].balance,
    180,
  );
  await reserve(tx, q2);
  await assert.rejects(() => settle(tx, q2, 61), /maximum/);
  await release(tx, q2);
  assert.equal((await db.query("SELECT * FROM ledger")).rows.length, 3);
  await db.close();
});
