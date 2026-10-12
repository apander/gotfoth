import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { welcomeForToken } from "../src/server/admin";
import { deliverWelcome, welcomeLetter } from "../src/server/mail";
import type { Tx } from "../src/server/db";

test("welcome letters address students, parents and teachers", () => {
  for (const role of ["student", "parent", "teacher"] as const) {
    const letter = welcomeLetter({
      name: "Oliver",
      email: "oliver@britams.nl",
      role,
      familyName: "Anderson",
      url: "https://gotfoth.vercel.app/?invite=example",
    });
    assert.equal(letter.subject, "Welcome to GotFoth");
    assert.match(letter.text, new RegExp(`as a ${role}`));
    assert.match(letter.text, /Oliver/);
    assert.match(letter.text, /oliver@britams.nl/);
    assert.match(letter.text, /Anderson/);
  }
});

test("a welcome email is sent only for a live invitation link", async () => {
  const previous = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = "https://gotfoth.vercel.app";
  const db = new PGlite();
  const tx = db as unknown as Tx;
  try {
    await db.exec(await readFile(new URL("../drizzle/0000_v2.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../drizzle/0005_people_names.sql", import.meta.url), "utf8"));
    const family = randomUUID();
    const learner = randomUUID();
    const token = "welcome-token-0123456789abcdef";
    await db.query(
      'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
      ["admin", "Admin", "admin@example.test"],
    );
    await db.query("INSERT INTO families(id,name) VALUES($1,$2)", [family, "Anderson"]);
    await db.query("INSERT INTO learners(id,family_id,name) VALUES($1,$2,$3)", [
      learner,
      family,
      "Oliver",
    ]);
    await db.query(
      `INSERT INTO invitations(id,token_hash,email,family_id,role,learner_id,display_name,expires_at,created_by)
       VALUES($1,$2,$3,$4,'student',$5,$6,now()+interval '7 days','admin')`,
      [
        randomUUID(),
        createHash("sha256").update(token).digest("hex"),
        "oliver@britams.nl",
        family,
        learner,
        "Oliver",
      ],
    );
    const letter = await welcomeForToken(
      tx,
      `https://gotfoth.vercel.app/?invite=${token}`,
    );
    assert.equal(letter.to, "oliver@britams.nl");
    assert.match(letter.text, /Hello Oliver/);
    assert.match(letter.text, /as a student/);
    await assert.rejects(
      () => welcomeForToken(tx, `https://example.test/?invite=${token}`),
      /not valid/,
    );
    await assert.rejects(
      () =>
        welcomeForToken(
          tx,
          "https://gotfoth.vercel.app/?invite=missing-token-value-long",
        ),
      /invalid, expired, or already used/,
    );
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = previous;
    await db.close();
  }
});

test("welcome email waits until mail delivery is configured", async () => {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  try {
    await assert.rejects(
      () =>
        deliverWelcome({
          to: "oliver@britams.nl",
          subject: "Welcome to GotFoth",
          text: "Hello",
        }),
      /not set up/,
    );
  } finally {
    if (key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = key;
    if (from === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = from;
  }
});
