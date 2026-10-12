import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { acceptInvitationInTransaction } from "../src/server/admin";
import { learnerAccess, type Tx } from "../src/server/db";
test("invitations bind recipient and role, reject reuse, expiry, revocation and unverified accounts", async () => {
  const db = new PGlite(),
    tx = db as unknown as Tx;
  await db.exec(
    await readFile(new URL("../drizzle/0000_v2.sql", import.meta.url), "utf8"),
  );
  await db.exec(
    await readFile(new URL("../drizzle/0005_people_names.sql", import.meta.url), "utf8"),
  );
  const family = randomUUID(),
    learner = randomUUID(),
    sibling = randomUUID();
  for (const id of ["admin", "parent", "student", "other"])
    await db.query(
      'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$1,$2,true)',
      [id, `${id}@example.test`],
    );
  await db.query("INSERT INTO families(id,name) VALUES($1,$2)", [
    family,
    "Family",
  ]);
  for (const id of [learner, sibling])
    await db.query("INSERT INTO learners(id,family_id,name) VALUES($1,$2,$3)", [
      id,
      family,
      id,
    ]);
  async function invite(
    token: string,
    role: string,
    expired = false,
    revoked = false,
  ) {
    await db.query(
      "INSERT INTO invitations(id,token_hash,email,family_id,role,learner_id,expires_at,created_by,revoked_at) VALUES($1,$2,$3,$4,$5,$6,now()+($7*interval '1 day'),'admin',CASE WHEN $8 THEN now() ELSE NULL END)",
      [
        randomUUID(),
        createHash("sha256").update(token).digest("hex"),
        `${role}@example.test`,
        family,
        role,
        learner,
        expired ? -1 : 7,
        revoked,
      ],
    );
  }
  const student = {
      id: "student",
      email: "student@example.test",
      emailVerified: true,
    },
    parent = {
      id: "parent",
      email: "parent@example.test",
      emailVerified: true,
    };
  await invite("valid", "student");
  await assert.rejects(
    () => acceptInvitationInTransaction(tx, parent, "valid"),
    /invalid/,
  );
  await assert.rejects(
    () =>
      acceptInvitationInTransaction(
        tx,
        { ...student, emailVerified: false },
        "valid",
      ),
    /verified/,
  );
  await db.exec("BEGIN");
  await acceptInvitationInTransaction(tx, student, "valid");
  await db.exec("COMMIT");
  await assert.rejects(
    () => acceptInvitationInTransaction(tx, student, "valid"),
    /already used/,
  );
  await invite("old", "parent", true);
  await assert.rejects(
    () => acceptInvitationInTransaction(tx, parent, "old"),
    /expired/,
  );
  await invite("revoked", "parent", false, true);
  await assert.rejects(
    () => acceptInvitationInTransaction(tx, parent, "revoked"),
    /invalid/,
  );
  await invite("parent-valid", "parent");
  await db.exec("BEGIN");
  await acceptInvitationInTransaction(tx, parent, "parent-valid");
  await db.exec("COMMIT");
  assert.equal(await learnerAccess(tx, student, family, learner), "student");
  await assert.rejects(
    () => learnerAccess(tx, student, family, sibling),
    /unavailable/,
  );
  await assert.rejects(
    () => learnerAccess(tx, student, family, learner, true),
    /unavailable/,
  );
  assert.equal(
    await learnerAccess(tx, parent, family, learner, true),
    "parent",
  );
  assert.equal(await learnerAccess(tx, parent, family, sibling), "parent");
  await db.close();
});
