import { z } from "zod";
import { database, family, superuser, enqueue, type Actor } from "./db";
import { actorTransaction, teachingFamilies } from "./groups";
import { fundingRead, pagination } from "./companion";
import { requireThat } from "../lib/errors";
import { destinationURL } from "../lib/experience";
import { tomorrowInZone, type Reminder } from "../lib/reminders";

const zone = z
  .string()
  .max(100)
  .refine((s) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: s });
      return true;
    } catch {
      return false;
    }
  });
const preferences = z.object({
  timezone: zone.default("UTC"),
  calendarTiming: z
    .enum(["default", "off", "10", "30", "60"])
    .default("default"),
  lowCreditMicros: z.number().int().min(0).max(1000000000).default(5000000),
});
async function contextFor(actor: Actor, context: string) {
  if (context === "admin") {
    await superuser(actor);
    return { role: "superuser", families: [] };
  }
  if (context === "teacher")
    return { role: "teacher", families: await teachingFamilies(actor) };
  z.string().uuid().parse(context);
  const membership = (
    await database().query(
      "SELECT m.role,f.id,f.name FROM memberships m JOIN families f ON f.id=m.family_id WHERE m.user_id=$1 AND m.family_id=$2 AND m.active AND NOT f.suspended AND f.deleted_at IS NULL",
      [actor.id, context],
    )
  ).rows[0];
  requireThat(membership, "FORBIDDEN", "Choose an authorised workspace.", 403);
  return { role: membership.role as string, families: [membership] };
}
export async function calendarPreferences(userId: string) {
  return actorTransaction(
    { id: userId, email: "", emailVerified: true },
    async (tx) =>
      preferences.parse(
        (
          await tx.query(
            "SELECT data FROM reminder_preferences WHERE user_id=$1 AND scope='calendar'",
            [userId],
          )
        ).rows[0]?.data ?? {},
      ),
  );
}
export async function reminderInbox(actor: Actor, params: URLSearchParams) {
  const context = params.get("context") ?? "",
    access = await contextFor(actor, context),
    { offset, limit } = pagination(params);
  const settings = await actorTransaction(actor, async (tx) =>
    preferences.parse(
      (
        await tx.query(
          "SELECT data FROM reminder_preferences WHERE user_id=$1 AND scope=$2",
          [actor.id, context],
        )
      ).rows[0]?.data ?? {},
    ),
  );
  const calendar = await calendarPreferences(actor.id);
  settings.calendarTiming = calendar.calendarTiming;
  const rows: Reminder[] = [];
  const add = (
    type: string,
    id: string,
    title: string,
    detail: string,
    href: string,
    at: unknown,
    actionable = true,
  ) =>
    rows.push({
      key: `${context}:${type}:${id}`,
      title,
      detail,
      href,
      at: new Date((at as string) ?? Date.now()).toISOString(),
      actionable,
    });
  for (const f of access.families)
    await family(actor, f.id, async (tx, role) => {
      const learners = (
        await tx.query(
          role === "student"
            ? "SELECT l.* FROM learners l JOIN memberships m ON m.learner_id=l.id WHERE m.user_id=$1 AND m.family_id=$2 AND m.role='student' AND m.active"
            : "SELECT l.* FROM learners l WHERE $1::text IS NOT NULL AND family_id=$2",
          [actor.id, f.id],
        )
      ).rows;
      const ids = learners.map((l) => l.id),
        name = (id: string) =>
          learners.find((l) => l.id === id)?.name ?? "Student";
      const link = (page: string, extra: Record<string, string> = {}) =>
        destinationURL({ context, family: f.id, page, ...extra });
      if (role === "student" || role === "parent") {
        const sessions = (
          await tx.query(
            "SELECT * FROM study_sessions WHERE learner_id=ANY($1::uuid[]) AND state='approved' AND (data->>'start')::timestamptz BETWEEN now()-interval '7 days' AND now()+interval '7 days' ORDER BY data->>'start'",
            [ids],
          )
        ).rows;
        for (const s of sessions)
          add(
            "session",
            `${s.id}:${s.data.start}`,
            `${name(s.learner_id)} · ${s.data.title}`,
            new Date(s.data.start) < new Date()
              ? "Planned study is unfinished. Move it or continue on a computer."
              : `${new Date(s.data.start).toLocaleString("en-GB", { timeZone: s.data.timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${s.data.timezone}`,
            link("Plan", {
              learner: s.learner_id,
              date: s.data.start.slice(0, 10),
            }),
            s.data.start,
          );
        const courses = (
          await tx.query(
            "SELECT id,learner_id,data FROM enrolments WHERE learner_id=ANY($1::uuid[])",
            [ids],
          )
        ).rows;
        for (const c of courses)
          for (const exam of c.data.examDates ?? [])
            if (exam.confirmed) {
              const today = new Intl.DateTimeFormat("sv-SE", {
                timeZone: c.data.timezone,
              }).format(new Date());
              const days =
                (new Date(exam.date + "T12:00:00Z").getTime() -
                  new Date(today + "T12:00:00Z").getTime()) /
                86400000;
              if (days >= 0 && days <= 30)
                add(
                  "exam",
                  `${c.id}:${exam.unit}:${exam.date}`,
                  `${name(c.learner_id)} · ${exam.unit}`,
                  `Confirmed exam · ${exam.date} · ${c.data.timezone}`,
                  link("Plan", { learner: c.learner_id, date: exam.date }),
                  exam.date + "T12:00:00Z",
                  false,
                );
            }
      }
      const published = (
        await tx.query(
          "SELECT r.id,r.learner_id,r.published_at,a.data->>'subject' AS subject FROM assessments r JOIN submissions s ON s.id=r.submission_id JOIN attempts a ON a.id=s.attempt_id WHERE r.learner_id=ANY($1::uuid[]) AND r.state='published' AND r.published_at>now()-interval '30 days'",
          [ids],
        )
      ).rows;
      for (const r of published)
        add(
          "feedback",
          `${r.id}:${new Date(r.published_at).toISOString()}`,
          `${name(r.learner_id)} · feedback ready`,
          `${f.name} · ${r.subject}`,
          link("Progress", { assessment: r.id, learner: r.learner_id }),
          r.published_at,
          false,
        );
      if (role === "student") {
        const tasks = (
          await tx.query(
            "SELECT * FROM corrective_tasks WHERE learner_id=ANY($1::uuid[]) AND completed_at IS NULL AND due_at<=now()+interval '1 day'",
            [ids],
          )
        ).rows;
        for (const t of tasks)
          add(
            "practice",
            t.id,
            "A topic is ready to revisit",
            t.topic,
            link("Progress", { topic: t.topic }),
            t.due_at,
          );
        const connection = (
          await tx.query(
            "SELECT state FROM calendar_connections WHERE user_id=$1",
            [actor.id],
          )
        ).rows[0];
        if (connection?.state === "reconnect")
          add(
            "calendar",
            actor.id,
            "Reconnect your calendar",
            "Your in-app diary is still saved.",
            link("Plan"),
            new Date(),
          );
      }
      if (role === "teacher") {
        const pending = (
          await tx.query(
            "SELECT r.id,r.learner_id,r.state,s.submitted_at,EXISTS(SELECT 1 FROM review_decisions d WHERE d.assessment_id=r.id AND d.data->>'action'='query') AS queried,(SELECT max(created_at) FROM review_decisions d WHERE d.assessment_id=r.id AND d.data->>'action'='query') AS queried_at FROM assessments r JOIN submissions s ON s.id=r.submission_id WHERE r.learner_id=ANY($1::uuid[]) AND r.state IN ('needs_review','failed')",
            [ids],
          )
        ).rows;
        for (const r of pending)
          add(
            "review",
            `${r.id}:${r.state}:${r.queried_at ? new Date(r.queried_at).toISOString() : ""}`,
            `${name(r.learner_id)} · ${r.state === "failed" ? "processing needs attention" : r.queried ? "result query" : "review needed"}`,
            f.name,
            link("Reviews", { assessment: r.id }),
            r.submitted_at,
          );
      }
    });
  if (access.role === "parent") {
    const f = access.families[0],
      funding = await fundingRead(actor, f.id, new URLSearchParams());
    const href = destinationURL({ context, family: f.id, page: "Credit" }),
      available =
        Number(funding.wallet.balance) - Number(funding.wallet.reserved);
    if (available < settings.lowCreditMicros)
      add(
        "funding",
        f.id,
        "Available credit is running low",
        `${f.name} · €${(available / 1e6).toFixed(2)} available`,
        href,
        new Date(),
      );
    for (const r of funding.wallet.awaiting)
      add(
        "funding-work",
        r.id,
        `${r.name} · feedback needs funding`,
        Number(r.remaining_cap) < Number(r.max_charge)
          ? "The monthly limit needs attention."
          : "Adding credit resumes eligible marking.",
        href,
        new Date(),
      );
    for (const p of funding.payments)
      add(
        "payment",
        `${p.id}:${p.status}`,
        "Payment update",
        `${f.name} · ${p.status === "refunded" ? "Payment refunded" : p.status === "disputed" ? "Payment disputed" : p.status === "paid" && p.credited_cents > 0 ? "Credit received" : "Payment needs attention"}`,
        href,
        new Date(),
        false,
      );
  }
  if (access.role === "superuser") {
    const jobs = (
      await database().query(
        "SELECT id,kind,created_at FROM outbox WHERE state='failed' OR (state='running' AND locked_at<now()-interval '15 minutes')",
      )
    ).rows;
    for (const j of jobs)
      add(
        "job",
        j.id,
        "Processing needs attention",
        `${j.kind} · open Operations on a computer`,
        destinationURL({ context, page: "Operations", search: j.id }),
        j.created_at,
      );
    const invites = (
      await database().query(
        "SELECT id,email,expires_at FROM invitations WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at BETWEEN now() AND now()+interval '2 days'",
      )
    ).rows;
    for (const i of invites)
      add(
        "invite",
        i.id,
        "Invitation expires soon",
        i.email,
        destinationURL({ context, page: "Invitations", search: i.email }),
        i.expires_at,
      );
    const content = (
      await database().query(
        "SELECT id,identity,status FROM catalogue WHERE status<>'published'",
      )
    ).rows;
    for (const c of content)
      add(
        "content",
        `${c.id}:${c.status}`,
        "Content awaits action",
        c.identity,
        destinationURL({
          context,
          page: "Content",
          tab: "catalogue",
          search: c.id,
        }),
        new Date(),
      );
  }
  const states = await actorTransaction(
    actor,
    async (tx) =>
      (
        await tx.query(
          "SELECT key,read_at,snoozed_until FROM reminder_state WHERE user_id=$1",
          [actor.id],
        )
      ).rows,
  );
  const enriched = rows
    .map((r) => {
      const s = states.find((s) => s.key === r.key);
      return {
        ...r,
        read: !!s?.read_at,
        snoozedUntil: s?.snoozed_until
          ? new Date(s.snoozed_until).toISOString()
          : null,
      };
    })
    .filter((r) => !r.snoozedUntil || new Date(r.snoozedUntil) <= new Date())
    .sort(
      (a, b) =>
        Number(b.actionable) - Number(a.actionable) ||
        a.at.localeCompare(b.at) ||
        a.key.localeCompare(b.key),
    );
  return {
    items: enriched.slice(offset, offset + limit),
    total: enriched.length,
    unread: enriched.filter((r) => !r.read).length,
    offset,
    limit,
    settings,
  };
}
export async function reminderAction(actor: Actor, input: unknown) {
  const v = z
    .object({
      context: z.string(),
      key: z.string().max(1000),
      action: z.enum(["read", "snooze"]),
    })
    .parse(input);
  const params = new URLSearchParams({ context: v.context, limit: "100" });
  // Revalidate against current authoritative visibility, including pages beyond the first.
  let inbox = await reminderInbox(actor, params),
    found = inbox.items.some((r) => r.key === v.key);
  for (let offset = 100; !found && offset < inbox.total; offset += 100) {
    params.set("offset", String(offset));
    inbox = await reminderInbox(actor, params);
    found = inbox.items.some((r) => r.key === v.key);
  }
  requireThat(
    found,
    "NOT_FOUND",
    "This reminder has resolved or is unavailable.",
    404,
  );
  const item = inbox.items.find((r) => r.key === v.key)!;
  const familyId = new URL(
    item.href,
    "https://gotfoth.invalid",
  ).searchParams.get("family");
  return actorTransaction(actor, async (tx) => {
    await tx.query(
      `INSERT INTO reminder_state(user_id,key,read_at,snoozed_until,family_id) VALUES($1,$2,now(),$3,$4) ON CONFLICT(user_id,key) DO UPDATE SET read_at=now(),snoozed_until=EXCLUDED.snoozed_until`,
      [
        actor.id,
        v.key,
        v.action === "snooze" ? tomorrowInZone(inbox.settings.timezone) : null,
        familyId,
      ],
    );
    return { saved: true };
  });
}
export async function saveReminderPreferences(actor: Actor, input: unknown) {
  const value = z
      .object({ context: z.string(), settings: preferences })
      .parse(input),
    access = await contextFor(actor, value.context);
  requireThat(
    access.role === "parent" || value.settings.lowCreditMicros === 5000000,
    "FORBIDDEN",
    "Funding preferences belong to parents.",
    403,
  );
  await actorTransaction(actor, async (tx) => {
    await tx.query(
      "INSERT INTO reminder_preferences(user_id,scope,data,family_id) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,scope) DO UPDATE SET data=EXCLUDED.data",
      [
        actor.id,
        value.context,
        JSON.stringify(value.settings),
        ["teacher", "admin"].includes(value.context) ? null : value.context,
      ],
    );
    if (access.role === "student")
      await tx.query(
        "INSERT INTO reminder_preferences(user_id,scope,data) VALUES($1,'calendar',$2) ON CONFLICT(user_id,scope) DO UPDATE SET data=EXCLUDED.data",
        [actor.id, JSON.stringify(value.settings)],
      );
  });
  if (access.role === "student")
    for (const f of access.families)
      await family(actor, f.id, async (tx) => {
        const sessions = (
          await tx.query(
            "SELECT s.id FROM study_sessions s JOIN memberships m ON m.learner_id=s.learner_id WHERE m.user_id=$1 AND m.family_id=$2 AND m.active AND m.role='student' AND s.state='approved'",
            [actor.id, f.id],
          )
        ).rows;
        for (const s of sessions)
          await enqueue(
            tx,
            "calendar",
            `calendar:prefs:${s.id}:${crypto.randomUUID()}`,
            { sessionId: s.id, userId: actor.id },
            f.id,
          );
        const courses = (
          await tx.query(
            "SELECT e.id,e.learner_id FROM enrolments e JOIN memberships m ON m.learner_id=e.learner_id WHERE m.user_id=$1 AND m.family_id=$2 AND m.active AND m.role='student'",
            [actor.id, f.id],
          )
        ).rows;
        for (const e of courses)
          await enqueue(
            tx,
            "calendar_exams",
            `exams:prefs:${e.id}:${crypto.randomUUID()}`,
            { enrolmentId: e.id, learnerId: e.learner_id, userId: actor.id },
            f.id,
          );
      });
  return { saved: true };
}
