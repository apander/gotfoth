import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  deleteAccountInTransaction,
  updateAccountInTransaction,
} from "../src/server/account";
import type { Tx } from "../src/server/db";

async function database() {
  const db = new PGlite();
  for (const file of ["0000_v2.sql", "0002_superusers.sql", "0005_people_names.sql"])
    await db.exec(await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
  return db;
}

test("a person can rename their account and the student record follows", async () => {
  const db = await database();
  const tx = db as unknown as Tx;
  const family = randomUUID();
  const learner = randomUUID();
  const actor = {
    id: "oliver",
    email: "oliver@britams.nl",
    emailVerified: true,
  };
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
    [actor.id, "Oliver Anderson", actor.email],
  );
  await db.query("INSERT INTO families(id,name) VALUES($1,$2)", [family, "Anderson"]);
  await db.query("INSERT INTO learners(id,family_id,name,email) VALUES($1,$2,$3,$4)", [
    learner,
    family,
    "Oliver",
    actor.email,
  ]);
  await db.query(
    "INSERT INTO memberships(user_id,family_id,role,learner_id,display_name) VALUES($1,$2,'student',$3,$4)",
    [actor.id, family, learner, "Oliver"],
  );
  await db.exec("BEGIN");
  await updateAccountInTransaction(tx, actor, "Ollie");
  await db.query("SELECT set_config('app.family_id',$1,true)", [family]);
  const learnerRow = await db.query("SELECT name FROM learners WHERE id=$1", [learner]);
  await db.exec("COMMIT");
  const user = await db.query('SELECT name FROM "user" WHERE id=$1', [actor.id]);
  const membership = await db.query(
    "SELECT display_name FROM memberships WHERE user_id=$1",
    [actor.id],
  );
  assert.equal((user.rows[0] as { name: string }).name, "Ollie");
  assert.equal((membership.rows[0] as { display_name: string }).display_name, "Ollie");
  assert.equal((learnerRow.rows[0] as { name: string }).name, "Ollie");
  await db.close();
});

test("a person can delete their sign-in and the family student remains", async () => {
  const db = await database();
  const tx = db as unknown as Tx;
  const family = randomUUID();
  const learner = randomUUID();
  const actor = {
    id: "oliver",
    email: "oliver@britams.nl",
    emailVerified: true,
  };
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
    [actor.id, "Oliver", actor.email],
  );
  await db.query("INSERT INTO families(id,name) VALUES($1,$2)", [family, "Anderson"]);
  await db.query("INSERT INTO learners(id,family_id,name) VALUES($1,$2,$3)", [
    learner,
    family,
    "Oliver",
  ]);
  await db.query(
    "INSERT INTO memberships(user_id,family_id,role,learner_id) VALUES($1,$2,'student',$3)",
    [actor.id, family, learner],
  );
  await db.exec("BEGIN");
  await assert.rejects(
    () => deleteAccountInTransaction(tx, actor, "someone-else@britams.nl"),
    /Type your email/,
  );
  await deleteAccountInTransaction(tx, actor, actor.email);
  await db.query("SELECT set_config('app.family_id',$1,true)", [family]);
  const learnerRow = await db.query("SELECT name FROM learners WHERE id=$1", [learner]);
  await db.exec("COMMIT");
  const user = await db.query('SELECT id FROM "user" WHERE id=$1', [actor.id]);
  const membership = await db.query("SELECT user_id FROM memberships WHERE user_id=$1", [
    actor.id,
  ]);
  assert.equal(user.rows.length, 0);
  assert.equal(membership.rows.length, 0);
  assert.equal((learnerRow.rows[0] as { name: string }).name, "Oliver");
  await db.close();
});

test("an account that created invitations is kept", async () => {
  const db = await database();
  const tx = db as unknown as Tx;
  const family = randomUUID();
  const actor = {
    id: "admin",
    email: "alasdair.anderson@gmail.com",
    emailVerified: true,
  };
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
    [actor.id, "Alasdair", actor.email],
  );
  await db.query("INSERT INTO families(id,name) VALUES($1,$2)", [family, "Anderson"]);
  await db.query(
    `INSERT INTO invitations(id,token_hash,email,family_id,role,expires_at,created_by)
     VALUES($1,$2,$3,$4,'parent',now()+interval '7 days',$5)`,
    [randomUUID(), "hash", "parent@britams.nl", family, actor.id],
  );
  await db.exec("BEGIN");
  await assert.rejects(
    () => deleteAccountInTransaction(tx, actor, actor.email),
    /have to be kept/,
  );
  await db.exec("ROLLBACK");
  const user = await db.query('SELECT id FROM "user" WHERE id=$1', [actor.id]);
  assert.equal(user.rows.length, 1);
  await db.close();
});
