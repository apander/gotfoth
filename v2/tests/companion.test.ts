import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import {
  canUse,
  resolveExperience,
  destinationURL,
} from "../src/lib/experience";
import {
  comparisonKey,
  compareEvidence,
  type ComparableEvidence,
} from "../src/lib/comparison";
import { tomorrowInZone } from "../src/lib/reminders";
import {
  seedTestFixtures,
  fixtureId,
  fixturePaper,
} from "../src/server/test-fixtures";
import { testFamilyIds, testLearnerId } from "../src/lib/test-accounts";
import {
  saveGroup,
  teacherGroups,
  groupComparison,
  groupScope,
} from "../src/server/groups";
import {
  companionSummary,
  activityRead,
  attemptSummary,
  diaryRead,
  fundingRead,
} from "../src/server/companion";
import {
  reminderInbox,
  reminderAction,
  saveReminderPreferences,
} from "../src/server/reminders";
import {
  createSession,
  planAction,
  updatePlanning,
} from "../src/server/planning";
import {
  calendarReminderOverrides,
  encryptToken,
  publishCalendar,
  publishExamCalendar,
  calendarConnect,
  calendarCallback,
} from "../src/server/integrations";
import type { Actor, Tx } from "../src/server/db";

test("phone and tablet identity selects companion independently of viewport; roles retain their workflow boundaries", () => {
  assert.equal(
    resolveExperience({ userAgent: "Mozilla Android Tablet" }),
    "companion",
  );
  assert.equal(
    resolveExperience({
      userAgent: "Mozilla Macintosh",
      platform: "MacIntel",
      maxTouchPoints: 5,
    }),
    "companion",
  );
  assert.equal(
    resolveExperience({
      userAgent: "Mozilla Windows",
      platform: "Win32",
      maxTouchPoints: 10,
    }),
    "desktop",
  );
  assert.equal(
    resolveExperience({
      userAgent: "Mozilla Macintosh",
      platform: "MacIntel",
      maxTouchPoints: 0,
    }),
    "desktop",
  );
  assert.equal(canUse("student", "companion", "test"), false);
  assert.equal(canUse("teacher", "companion", "review"), false);
  assert.equal(canUse("teacher", "companion", "group"), false);
  assert.equal(canUse("parent", "companion", "fund"), true);
  assert.equal(canUse("student", "desktop", "test"), true);
  assert.equal(
    destinationURL(
      Object.assign(
        { attempt: "task" },
        { token: "do-not-share", code: "oauth-code" },
      ),
    ),
    "/?attempt=task",
  );
  assert.equal(canUse("parent", "desktop", "test"), false);
  assert.equal(
    destinationURL({ context: "teacher", assessment: "work", group: "group" }),
    "/?context=teacher&assessment=work&group=group",
  );
});
test("comparisons separate frozen source/rubric and practice conditions, count each pupil once and suppress small-group statistics", () => {
  const paper = fixturePaper("psychology"),
    q = paper.questions[0];
  const data = {
    subject: "psychology",
    specification: "2026",
    questions: [q],
    resources: [],
    seenQuestionIds: [],
  };
  const result = [
    { questionId: q.id, rubricId: q.rubric.id, available: q.marks },
  ];
  const key = comparisonKey(data, "independent", result)!;
  assert.notEqual(
    key,
    comparisonKey({ ...data, assisted: true }, "independent", result),
  );
  assert.notEqual(
    key,
    comparisonKey({ ...data, seenQuestionIds: [q.id] }, "independent", result),
  );
  assert.notEqual(key, comparisonKey(data, "timed", result));
  assert.notEqual(
    key,
    comparisonKey(
      {
        ...data,
        questions: [{ ...q, rubric: { ...q.rubric, text: "Changed rubric" } }],
      },
      "independent",
      result,
    ),
  );
  const make = (
    learnerId: string,
    awarded: number,
    at = "2026-10-19T12:00:00Z",
  ): ComparableEvidence => ({
    id: randomUUID(),
    learnerId,
    familyId: "f",
    name: learnerId,
    key,
    label: "match",
    awarded,
    available: 10,
    at,
    topics: ["research.methods"],
  });
  const rows = [
    make("a", 2, "2026-10-18T12:00:00Z"),
    make("a", 6),
    make("b", 8),
    make("c", 10),
    { ...make("d", 0), key: "different" },
  ];
  const compared = compareEvidence(rows, key);
  assert.equal(compared.count, 3);
  assert.equal(compared.median, 80);
  assert.deepEqual(compared.range, [60, 100]);
  assert.equal(compared.students[0].change, 40);
  assert.equal(
    compareEvidence(
      rows.filter((r) => r.learnerId !== "c"),
      key,
    ).median,
    null,
  );
  assert.equal(
    comparisonKey(data, "independent", [{ ...result[0], available: 99 }]),
    null,
  );
});
test("tomorrow uses the saved timezone across DST, and calendar Off differs from defaults", () => {
  assert.equal(
    tomorrowInZone("Europe/Amsterdam", new Date("2026-10-24T12:00:00Z")),
    "2026-10-24T22:00:00.000Z",
  );
  assert.equal(
    tomorrowInZone("Europe/Amsterdam", new Date("2026-10-25T12:00:00Z")),
    "2026-10-25T23:00:00.000Z",
  );
  assert.equal(
    tomorrowInZone("Europe/Amsterdam", new Date("2026-03-29T12:00:00Z")),
    "2026-03-29T22:00:00.000Z",
  );
  assert.deepEqual(calendarReminderOverrides("default"), { useDefault: true });
  assert.deepEqual(calendarReminderOverrides("off"), {
    useDefault: false,
    overrides: [],
  });
  assert.deepEqual(calendarReminderOverrides("30"), {
    useDefault: false,
    overrides: [{ method: "popup", minutes: 30 }],
  });
});

test("companion reads, diary, groups and reminders enforce live memberships and RLS without changing attempt ownership", async () => {
  const db = new PGlite();
  const before = process.env.DATABASE_URL;
  const beforeKey = process.env.TOKEN_ENCRYPTION_KEY;
  try {
    for (const name of [
      "0000_v2",
      "0001_teacher",
      "0002_superusers",
      "0003_paper_pdf",
      "0004_one_student_family",
      "0005_people_names",
      "0006_persona_goals",
      "0007_companion",
    ])
      await db.exec(
        await readFile(
          new URL(`../drizzle/${name}.sql`, import.meta.url),
          "utf8",
        ),
      );
    await seedTestFixtures(db as unknown as Tx);
    process.env.DATABASE_URL =
      "postgresql://runtime:testing@unit.neon.tech/neondb?sslmode=require";
    const query = async (text: any, values?: any[]) => {
      const result = await db.query(text, values);
      return { ...result, rowCount: result.rows.length || result.affectedRows };
    };
    mock.method(Pool.prototype, "query", query as any);
    mock.method(
      Pool.prototype,
      "connect",
      async () => ({ query, release() {} }) as any,
    );
    await db.exec(
      "CREATE ROLE companion_runtime NOLOGIN; GRANT USAGE ON SCHEMA public TO companion_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO companion_runtime; SET ROLE companion_runtime",
    );
    const actor = (key: string): Actor => ({
      id: `ux-fixture-${key}`,
      email: `${key}@ux.gotfoth.test`,
      emailVerified: true,
    });
    const family = testFamilyIds.River,
      alex = testLearnerId(0),
      jamie = testLearnerId(1),
      sam = testLearnerId(2);
    const summary = await companionSummary(actor("alex"), family);
    assert.equal(summary.learners.length, 1);
    assert.equal(summary.learners[0].id, alex);
    assert.ok(!("monthly_cap" in summary.learners[0]));
    assert.ok(!("wallet" in summary));
    assert.ok(!("papers" in summary));
    const actual = summary.attempts.find((a) => a.state === "in_progress")!.id;
    await db.query("SELECT set_config('app.family_id',$1,false)", [family]);
    const beforeExposure = await db.query(
      "SELECT question_id FROM exposure WHERE learner_id=$1 ORDER BY question_id",
      [alex],
    );
    const beforeAttempt = await db.query(
      "SELECT editor_token,editor_epoch,deadline FROM attempts WHERE id=$1",
      [actual],
    );
    const source = await attemptSummary(actor("alex"), family, actual);
    assert.ok(!("data" in source));
    assert.ok(!("questions" in source));
    await db.query("SELECT set_config('app.family_id',$1,false)", [family]);
    const afterAttempt = await db.query(
      "SELECT editor_token,editor_epoch,deadline FROM attempts WHERE id=$1",
      [actual],
    );
    assert.deepEqual(afterAttempt.rows, beforeAttempt.rows);
    assert.equal(beforeAttempt.rows.length, 1);
    assert.deepEqual(
      (
        await db.query(
          "SELECT question_id FROM exposure WHERE learner_id=$1 ORDER BY question_id",
          [alex],
        )
      ).rows,
      beforeExposure.rows,
    );
    await assert.rejects(() => attemptSummary(actor("jamie"), family, actual));
    await assert.rejects(() =>
      fundingRead(actor("alex"), family, new URLSearchParams()),
    );
    const group = await saveGroup(actor("morgan"), {
      action: "save",
      name: "Research group",
      members: [
        { familyId: family, learnerId: alex },
        { familyId: family, learnerId: jamie },
        { familyId: testFamilyIds.Hill, learnerId: sam },
      ],
    });
    assert.ok("id" in group);
    const groupId = (group as { id: string }).id;
    assert.equal(
      (await groupScope(actor("morgan"), groupId)).members.length,
      3,
    );
    await assert.rejects(() => groupScope(actor("lee"), groupId));
    await assert.rejects(() =>
      saveGroup(actor("jordan"), { action: "save", name: "No", members: [] }),
    );
    await assert.rejects(() =>
      saveGroup(actor("morgan"), {
        action: "save",
        name: "No",
        members: [
          { familyId: testFamilyIds.Brook, learnerId: testLearnerId(4) },
        ],
      }),
    );
    const comparison = await groupComparison(
      actor("morgan"),
      new URLSearchParams({ group: groupId }),
    );
    assert.equal(comparison.activity.length, 3);
    assert.equal(comparison.median, null);
    await db.query("SELECT set_config('app.family_id',$1,false)", [family]);
    const base = (
      await db.query<any>(
        "SELECT a.data,r.effective FROM assessments r JOIN submissions s ON s.id=r.submission_id JOIN attempts a ON a.id=s.attempt_id WHERE r.learner_id=$1 AND r.state='published' LIMIT 1",
        [alex],
      )
    ).rows[0];
    async function published(familyId: string, learnerId: string) {
      await db.query("SELECT set_config('app.family_id',$1,false)", [familyId]);
      const a = randomUUID(),
        s = randomUUID(),
        r = randomUUID();
      await db.query(
        "WITH a AS (INSERT INTO attempts(id,family_id,learner_id,mode,state,data) VALUES($1,$2,$3,'independent','submitted',$4) RETURNING id),s AS (INSERT INTO submissions(id,family_id,learner_id,attempt_id,answers,choices,ended_by) SELECT $5,$2,$3,id,'[]','[]','manual' FROM a RETURNING id) INSERT INTO assessments(id,family_id,learner_id,submission_id,state,effective,published_at) SELECT $6,$2,$3,id,'published',$7,now() FROM s",
        [
          a,
          familyId,
          learnerId,
          JSON.stringify(base.data),
          s,
          r,
          JSON.stringify(base.effective),
        ],
      );
      return r;
    }
    const samPublished = await published(testFamilyIds.Hill, sam);
    const matched = await groupComparison(
      actor("morgan"),
      new URLSearchParams({ group: groupId }),
    );
    assert.equal(matched.count, 3);
    assert.notEqual(matched.median, null);
    await db.query("SELECT set_config('app.family_id',$1,false)", [
      testFamilyIds.Hill,
    ]);
    await db.query("UPDATE assessments SET state='needs_review' WHERE id=$1", [
      samPublished,
    ]);
    assert.equal(
      (
        await groupComparison(
          actor("morgan"),
          new URLSearchParams({ group: groupId }),
        )
      ).median,
      null,
      "unpublished/query-held results cannot enter comparison",
    );
    for (let i = 0; i < 125; i++) await published(family, alex);
    const older = await activityRead(
      actor("jordan"),
      family,
      new URLSearchParams({ learner: alex, offset: "100" }),
    );
    assert.equal(older.total, 126);
    assert.equal(older.items.length, 25);
    const last = await activityRead(
      actor("alex"),
      family,
      new URLSearchParams({ learner: alex, offset: "125" }),
    );
    assert.equal(last.items.length, 1);
    // Revocation immediately changes the group's effective membership.
    await db.query(
      "UPDATE memberships SET active=false WHERE user_id='ux-fixture-morgan' AND family_id=$1",
      [testFamilyIds.Hill],
    );
    assert.equal(
      (await groupScope(actor("morgan"), groupId)).members.length,
      2,
    );
    const course = summary.enrolments[0],
      sessionId = randomUUID();
    const tomorrow = new Date(Date.now() + 3 * 86400000)
      .toISOString()
      .slice(0, 10);
    const value = {
      familyId: family,
      id: sessionId,
      learnerId: alex,
      enrolmentId: course.id,
      topic: course.data.taughtTopics[0],
      date: tomorrow,
      time: "17:00",
      minutes: 20,
    };
    await createSession(actor("alex"), family, value);
    await createSession(actor("alex"), family, value);
    await planAction(actor("alex"), family, {
      id: sessionId,
      action: "approve",
    });
    await db.query("SELECT set_config('app.family_id',$1,false)", [family]);
    const planned = (
      await db.query<any>("SELECT data FROM study_sessions WHERE id=$1", [
        sessionId,
      ])
    ).rows[0];
    const draft = (
      await db.query<any>("SELECT * FROM attempts WHERE id=$1", [
        planned.data.attemptId,
      ])
    ).rows[0];
    assert.equal(draft.state, "draft");
    assert.equal(draft.started_at, null);
    assert.equal(draft.deadline, null);
    assert.equal(draft.editor_token, null);
    await db.query(
      "UPDATE attempts SET state='in_progress',deadline=now()+interval '20 minutes' WHERE id=$1",
      [draft.id],
    );
    await assert.rejects(() =>
      planAction(actor("alex"), family, {
        id: sessionId,
        action: "reschedule",
        start: new Date(Date.now() + 86400000).toISOString(),
      }),
    );
    await assert.rejects(() =>
      planAction(actor("alex"), family, { id: sessionId, action: "cancel" }),
    );
    await updatePlanning(actor("alex"), family, {
      id: course.id,
      learnerId: alex,
      patch: { blockedDates: [tomorrow] },
    });
    await assert.rejects(() =>
      updatePlanning(actor("jordan"), family, {
        id: course.id,
        learnerId: alex,
        patch: { sessionMinutes: 10 },
      }),
    );
    const diary = await diaryRead(
      actor("jordan"),
      family,
      new URLSearchParams({ learner: alex, from: tomorrow, to: tomorrow }),
    );
    // Seeded sessions may also fall on this date. Assert the specific session and
    // learner isolation rather than making the test depend on the weekday.
    const diarySession = diary.items.find((item) => item.id === sessionId);
    assert.equal(diarySession?.learner_id, alex);
    assert.equal(diarySession?.data.attemptId, draft.id);
    assert.ok(diary.items.every((item) => item.learner_id === alex));
    const first = await reminderInbox(
      actor("morgan"),
      new URLSearchParams({ context: "teacher" }),
    );
    assert.ok(first.items.some((r) => r.title.includes("query")));
    const item = first.items[0];
    await reminderAction(actor("morgan"), {
      context: "teacher",
      key: item.key,
      action: "read",
    });
    const second = await reminderInbox(
      actor("morgan"),
      new URLSearchParams({ context: "teacher" }),
    );
    assert.equal(second.items.find((r) => r.key === item.key)?.read, true);
    await reminderAction(actor("morgan"), {
      context: "teacher",
      key: item.key,
      action: "snooze",
    });
    assert.equal(
      (
        await reminderInbox(
          actor("morgan"),
          new URLSearchParams({ context: "teacher" }),
        )
      ).items.some((r) => r.key === item.key),
      false,
    );
    await assert.rejects(() =>
      reminderAction(actor("jordan"), {
        context: family,
        key: item.key,
        action: "read",
      }),
    );
    await saveReminderPreferences(actor("jordan"), {
      context: family,
      settings: {
        timezone: "Europe/Amsterdam",
        calendarTiming: "default",
        lowCreditMicros: 9000000,
      },
    });
    assert.equal(
      (
        await reminderInbox(
          actor("jordan"),
          new URLSearchParams({ context: family }),
        )
      ).settings.lowCreditMicros,
      9000000,
    );
    await assert.rejects(() =>
      saveReminderPreferences(actor("alex"), {
        context: family,
        settings: { timezone: "UTC", lowCreditMicros: 1 },
      }),
    );
    assert.equal(
      (await db.query("SELECT * FROM teacher_groups")).rows.length,
      0,
      "actor RLS does not leak outside a transaction",
    );
    const history = await activityRead(
      actor("alex"),
      family,
      new URLSearchParams({ learner: alex, limit: "1" }),
    );
    assert.equal(history.items.length, 1);
    assert.equal(history.items[0].state, "published");
    await assert.rejects(() =>
      activityRead(
        actor("alex"),
        family,
        new URLSearchParams({ learner: jamie }),
      ),
    );
    assert.ok(
      (await teacherGroups(actor("morgan"))).groups.some(
        (g) => g.id === groupId,
      ),
    );
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    await db.query(
      "INSERT INTO calendar_connections(user_id,encrypted_token,calendar_id) VALUES($1,$2,'test-calendar')",
      [actor("alex").id, encryptToken("synthetic-refresh-token")],
    );
    await saveReminderPreferences(actor("alex"), {
      context: family,
      settings: {
        timezone: "Europe/Amsterdam",
        calendarTiming: "30",
        lowCreditMicros: 5000000,
      },
    });
    const calendarCalls: { url: string; method: string; body: any }[] = [];
    let failToken = false;
    mock.method(globalThis, "fetch", async (input: any, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com"))
        return Response.json(
          failToken
            ? { error: "invalid_grant" }
            : {
                access_token: "synthetic-test-token",
                refresh_token: "synthetic-refresh-token",
              },
          { status: failToken ? 400 : 200 },
        );
      calendarCalls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(null, {
        status:
          init?.method === "POST" ? 409 : init?.method === "DELETE" ? 404 : 200,
      });
    });
    const connection = await calendarConnect(actor("alex"), {
      familyId: family,
    });
    const oauthState = new URL(connection.url).searchParams.get("state")!;
    await assert.rejects(() =>
      calendarCallback(actor("jamie"), "test-code", oauthState),
    );
    assert.equal(
      (await calendarCallback(actor("alex"), "test-code", oauthState)).familyId,
      family,
    );
    await assert.rejects(() =>
      calendarCallback(actor("alex"), "test-code", oauthState),
    );
    await publishCalendar(actor("alex").id, family, sessionId);
    assert.deepEqual(
      calendarCalls.find((c) => c.method === "PUT")?.body.reminders,
      { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
    );
    await updatePlanning(actor("alex"), family, {
      id: course.id,
      learnerId: alex,
      patch: {
        examDates: [{ unit: "WPS04/01", date: tomorrow, confirmed: true }],
      },
    });
    await publishExamCalendar(actor("alex").id, family, course.id, alex, []);
    const examEvent = calendarCalls.find((c) =>
      c.body?.summary?.includes("exam"),
    );
    assert.equal(examEvent?.body.start.date, tomorrow);
    assert.match(examEvent!.body.id, /^[a-v0-9]{5,1024}$/);
    assert.equal(examEvent?.body.start.dateTime, undefined);
    await publishExamCalendar(actor("alex").id, family, course.id, alex, []);
    assert.equal(
      new Set(
        calendarCalls
          .filter((c) => c.body?.summary?.includes("exam"))
          .map((c) => c.body.id),
      ).size,
      1,
      "retries reuse the same exam event identity",
    );
    await updatePlanning(actor("alex"), family, {
      id: course.id,
      learnerId: alex,
      patch: { examDates: [] },
    });
    await publishExamCalendar(actor("alex").id, family, course.id, alex, [
      "WPS04/01",
    ]);
    assert.ok(
      calendarCalls.some(
        (c) => c.method === "DELETE" && c.url.endsWith(examEvent!.body.id),
      ),
    );
    failToken = true;
    await assert.rejects(
      () => publishCalendar(actor("alex").id, family, sessionId),
      /CALENDAR_RECONNECT/,
    );
    assert.ok(
      (
        await reminderInbox(
          actor("alex"),
          new URLSearchParams({ context: family }),
        )
      ).items.some((r) => r.title === "Reconnect your calendar"),
    );
  } finally {
    mock.restoreAll();
    if (beforeKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = beforeKey;
    if (before === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = before;
    await db.close();
  }
});
