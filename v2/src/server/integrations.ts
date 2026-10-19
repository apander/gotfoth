import {
  randomUUID,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import Stripe from "stripe";
import { z } from "zod";
import {
  database,
  family,
  transaction,
  learnerAccess,
  enqueue,
  type Actor,
} from "./db";
import { credit } from "./finance";
import { requireThat, missing } from "../lib/errors";
import { calendarPreferences } from "./reminders";
import { createHash } from "node:crypto";
export function calendarReminderOverrides(timing: string) {
  return timing === "default"
    ? { useDefault: true }
    : {
        useDefault: false,
        overrides:
          timing === "off"
            ? []
            : [{ method: "popup", minutes: Number(timing) }],
      };
}
export function stripe() {
  requireThat(
    process.env.STRIPE_SECRET_KEY,
    "PAYMENTS_SETUP",
    "Payments are not configured.",
    503,
  );
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}
export async function checkout(actor: Actor, familyId: string, input: unknown) {
  const { cents } = z
    .object({ cents: z.union([z.literal(1000), z.literal(2500)]) })
    .parse(input);
  requireThat(
    process.env.PAYMENTS_ENABLED === "true" &&
      process.env.MERCHANT_REFUND_POLICY_URL,
    "PAYMENTS_DISABLED",
    "Real-money checkout has not been enabled.",
    503,
  );
  const id = randomUUID();
  await family(actor, familyId, async (tx, role) => {
    requireThat(
      role === "parent",
      "FORBIDDEN",
      "Only a parent can purchase credit.",
      403,
    );
    await tx.query(
      "INSERT INTO payments(id,family_id,expected_cents) VALUES($1,$2,$3)",
      [id, familyId, cents],
    );
  });
  const session = await stripe().checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: cents,
            product_data: { name: "GotFoth family credit" },
          },
        },
      ],
      client_reference_id: id,
      metadata: { paymentId: id, familyId },
      payment_intent_data: { metadata: { paymentId: id, familyId } },
      success_url: `${process.env.BETTER_AUTH_URL}/?page=Credit&context=${familyId}&family=${familyId}&payment=return&paymentId=${id}`,
      cancel_url: `${process.env.BETTER_AUTH_URL}/?page=Credit&context=${familyId}&family=${familyId}&payment=cancelled&paymentId=${id}`,
    },
    { idempotencyKey: `checkout:${id}` },
  );
  await family(actor, familyId, async (tx) => {
    await tx.query("UPDATE payments SET checkout_id=$2 WHERE id=$1", [
      id,
      session.id,
    ]);
  });
  return { url: session.url };
}
export async function paymentWebhook(request: Request) {
  requireThat(
    process.env.STRIPE_WEBHOOK_SECRET,
    "WEBHOOK_SETUP",
    "Webhook is not configured.",
    503,
  );
  const signature = request.headers.get("stripe-signature");
  requireThat(signature, "SIGNATURE", "Missing payment signature.");
  const event = stripe().webhooks.constructEvent(
    await request.text(),
    signature,
    process.env.STRIPE_WEBHOOK_SECRET,
  );
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const id = session.metadata?.paymentId,
      familyId = session.metadata?.familyId;
    if (id && familyId)
      await transaction(async (tx) => {
        const p = (
          await tx.query(
            "SELECT * FROM payments WHERE id=$1 AND family_id=$2 FOR UPDATE",
            [id, familyId],
          )
        ).rows[0];
        requireThat(
          p &&
            session.client_reference_id === id &&
            session.currency === "eur" &&
            session.amount_total === p.expected_cents,
          "PAYMENT_MISMATCH",
          "Payment does not match the funding request.",
        );
        if (session.payment_status !== "paid") return;
        await credit(
          tx,
          familyId,
          p.expected_cents * 10000,
          `payment:${id}`,
          session.id,
        );
        await tx.query(
          "UPDATE payments SET checkout_id=$2,intent_id=$3,credited_cents=expected_cents,status='paid' WHERE id=$1",
          [
            id,
            session.id,
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id,
          ],
        );
      }, familyId);
  }
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const intent =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id;
    // Retrieve metadata from Stripe; do not trust browser-supplied family or refund amounts.
    if (intent) {
      const pi = await stripe().paymentIntents.retrieve(intent);
      const { familyId, paymentId } = pi.metadata;
      if (familyId && paymentId)
        await transaction(async (tx) => {
          const p = (
            await tx.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [
              paymentId,
            ])
          ).rows[0];
          requireThat(p, "PAYMENT_MISMATCH", "Unknown refunded payment.");
          const current = await stripe().charges.retrieve(charge.id);
          const reversed = Math.min(
              current.amount_refunded + p.disputed_cents,
              p.expected_cents,
            ),
            delta = reversed - p.reversed_cents;
          if (delta !== 0)
            await credit(
              tx,
              familyId,
              -delta * 10000,
              `refund:${event.id}`,
              charge.id,
              "refund",
            );
          await tx.query(
            "UPDATE payments SET reversed_cents=$2,refunded_cents=$3,status='refunded' WHERE id=$1",
            [paymentId, reversed, current.amount_refunded],
          );
        }, familyId);
    }
  }
  if (
    [
      "charge.dispute.created",
      "charge.dispute.updated",
      "charge.dispute.closed",
      "charge.dispute.funds_withdrawn",
      "charge.dispute.funds_reinstated",
    ].includes(event.type)
  ) {
    const disputed = event.data.object as Stripe.Dispute;
    const current = await stripe().disputes.retrieve(disputed.id);
    const charge = await stripe().charges.retrieve(
      typeof current.charge === "string" ? current.charge : current.charge.id,
    );
    const intent =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id;
    if (intent) {
      const pi = await stripe().paymentIntents.retrieve(intent);
      const { familyId, paymentId } = pi.metadata;
      if (familyId && paymentId)
        await transaction(async (tx) => {
          const p = (
            await tx.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [
              paymentId,
            ])
          ).rows[0];
          requireThat(
            p &&
              charge.currency === "eur" &&
              charge.amount === p.expected_cents,
            "PAYMENT_MISMATCH",
            "Dispute does not match this payment.",
          );
          const disputedCents = ["won", "warning_closed"].includes(
            current.status,
          )
            ? 0
            : Math.min(current.amount, p.expected_cents);
          const reversed = Math.min(
              charge.amount_refunded + disputedCents,
              p.expected_cents,
            ),
            delta = reversed - p.reversed_cents;
          if (delta !== 0)
            await credit(
              tx,
              familyId,
              -delta * 10000,
              `dispute:${event.id}`,
              current.id,
              delta > 0 ? "dispute" : "dispute_reinstated",
            );
          await tx.query(
            "UPDATE payments SET reversed_cents=$2,refunded_cents=$3,disputed_cents=$4,dispute_id=$5,status=$6 WHERE id=$1",
            [
              paymentId,
              reversed,
              charge.amount_refunded,
              disputedCents,
              current.id,
              disputedCents ? "disputed" : reversed ? "refunded" : "paid",
            ],
          );
        }, familyId);
    }
  }
  return { received: true };
}
function encryptionKey() {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? "", "base64");
  requireThat(
    key.length === 32,
    "ENCRYPTION_SETUP",
    "Calendar encryption is not configured.",
    503,
  );
  return key;
}
export function encryptToken(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function decryptToken(value: string) {
  const buf = Buffer.from(value, "base64"),
    decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      buf.subarray(0, 12),
    );
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([
    decipher.update(buf.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
export async function calendarConnect(actor: Actor, input: unknown = {}) {
  encryptionKey();
  const familyId = z
    .object({ familyId: z.string().uuid().optional() })
    .parse(input).familyId;
  if (familyId)
    await family(actor, familyId, async (_tx, role) =>
      requireThat(
        role === "student",
        "FORBIDDEN",
        "Student calendar access required.",
        403,
      ),
    );
  const state = randomBytes(32).toString("base64url");
  await database().query(
    "INSERT INTO verification(id,identifier,value,\"expiresAt\") VALUES($1,$2,$3,now()+interval '10 minutes')",
    [randomUUID(), `calendar:${state}`, actor.id],
  );
  if (familyId)
    await database().query(
      "INSERT INTO verification(id,identifier,value,\"expiresAt\") VALUES($1,$2,$3,now()+interval '10 minutes')",
      [randomUUID(), `calendar-return:${state}`, familyId],
    );
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: `${process.env.BETTER_AUTH_URL}/api/calendar/callback`,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.app.created",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
}
export async function calendarCallback(
  actor: Actor,
  code: string,
  state: string,
) {
  const familyId = await transaction(async (tx) => {
    const v = (
      await tx.query(
        'DELETE FROM verification WHERE identifier=$1 AND value=$2 AND "expiresAt">now() RETURNING id',
        [`calendar:${state}`, actor.id],
      )
    ).rows;
    requireThat(
      v.length,
      "OAUTH_STATE",
      "Calendar authorisation expired or does not match this account.",
    );
    return (
      await tx.query(
        'DELETE FROM verification WHERE identifier=$1 AND "expiresAt">now() RETURNING value',
        [`calendar-return:${state}`],
      )
    ).rows[0]?.value as string | undefined;
  });
  if (familyId)
    await family(actor, familyId, async (_tx, role) =>
      requireThat(
        role === "student",
        "FORBIDDEN",
        "Student calendar access required.",
        403,
      ),
    );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${process.env.BETTER_AUTH_URL}/api/calendar/callback`,
      grant_type: "authorization_code",
    }),
  });
  requireThat(response.ok, "CALENDAR_AUTH", "Calendar authorisation failed.");
  const token = await response.json();
  requireThat(
    token.refresh_token,
    "CALENDAR_AUTH",
    "Google did not return offline calendar access.",
  );
  const previous = (
    await database().query(
      "SELECT calendar_id FROM calendar_connections WHERE user_id=$1",
      [actor.id],
    )
  ).rows[0];
  let calendarId = previous?.calendar_id;
  if (!calendarId) {
    const calendar = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ summary: "GotFoth" }),
      },
    );
    requireThat(
      calendar.ok,
      "CALENDAR_CREATE",
      "Could not create the study calendar.",
    );
    calendarId = (await calendar.json()).id;
  }
  await database().query(
    "INSERT INTO calendar_connections(user_id,encrypted_token,calendar_id) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET encrypted_token=$2,calendar_id=$3,state='connected'",
    [actor.id, encryptToken(token.refresh_token), calendarId],
  );
  const memberships = (
    await database().query(
      "SELECT family_id,learner_id FROM memberships WHERE user_id=$1 AND active AND role='student'",
      [actor.id],
    )
  ).rows;
  for (const m of memberships)
    await family(actor, m.family_id, async (tx) => {
      for (const s of (
        await tx.query(
          "SELECT id FROM study_sessions WHERE learner_id=$1 AND state='approved'",
          [m.learner_id],
        )
      ).rows)
        await enqueue(
          tx,
          "calendar",
          `calendar:connect:${s.id}:${randomUUID()}`,
          { sessionId: s.id, userId: actor.id },
          m.family_id,
        );
      for (const e of (
        await tx.query("SELECT id FROM enrolments WHERE learner_id=$1", [
          m.learner_id,
        ])
      ).rows)
        await enqueue(
          tx,
          "calendar_exams",
          `exams:connect:${e.id}:${randomUUID()}`,
          { enrolmentId: e.id, learnerId: m.learner_id, userId: actor.id },
          m.family_id,
        );
    });
  return { familyId };
}
export async function publishCalendar(
  userId: string,
  familyId: string,
  sessionId: string,
) {
  const connection = (
    await database().query(
      "SELECT * FROM calendar_connections WHERE user_id=$1 AND state=$2",
      [userId, "connected"],
    )
  ).rows[0];
  if (!connection) return;
  const row = await transaction(async (tx) => {
    const session = (
      await tx.query("SELECT * FROM study_sessions WHERE id=$1", [sessionId])
    ).rows[0];
    if (!session) return null;
    await learnerAccess(
      tx,
      { id: userId, email: "", emailVerified: true },
      familyId,
      session.learner_id,
    );
    return session;
  }, familyId);
  if (!row) return;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: decryptToken(connection.encrypted_token),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    await database().query(
      "UPDATE calendar_connections SET state='reconnect' WHERE user_id=$1",
      [userId],
    );
    throw new Error("CALENDAR_RECONNECT");
  }
  const token = (await response.json()).access_token;
  const eventId = `sv${sessionId.replaceAll("-", "")}`;
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendar_id)}/events`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (
    row.state === "cancelled" ||
    row.state === "proposed" ||
    row.state === "completed"
  ) {
    const r = await fetch(`${url}/${eventId}`, { method: "DELETE", headers });
    requireThat(
      r.ok || r.status === 404 || r.status === 410,
      "CALENDAR_FAILURE",
      "Calendar cancellation failed.",
    );
    return;
  }
  requireThat(
    row.state === "approved",
    "PLAN_APPROVAL",
    "Only approved sessions can be published.",
  );
  const event = {
    id: eventId,
    summary: row.data.title,
    start: { dateTime: row.data.start, timeZone: row.data.timezone },
    end: {
      dateTime: new Date(
        new Date(row.data.start).getTime() + row.data.minutes * 60000,
      ).toISOString(),
      timeZone: row.data.timezone,
    },
    description: `Open your study task: ${process.env.BETTER_AUTH_URL}/?page=Plan&family=${familyId}&attempt=${row.data.attemptId}`,
    reminders: calendarReminderOverrides(
      (await calendarPreferences(userId)).calendarTiming,
    ),
  };
  let result = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(event),
  });
  if (result.status === 409)
    result = await fetch(`${url}/${eventId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(event),
    });
  requireThat(
    result.ok,
    "CALENDAR_FAILURE",
    "Calendar publishing failed. Your in-app plan is unchanged.",
  );
  await transaction(
    (tx) =>
      tx.query("UPDATE study_sessions SET calendar_event_id=$2 WHERE id=$1", [
        sessionId,
        eventId,
      ]),
    familyId,
  );
}

export async function publishExamCalendar(
  userId: string,
  familyId: string,
  enrolmentId: string,
  learnerId: string,
  previousUnits: string[] = [],
) {
  const connection = (
    await database().query(
      "SELECT * FROM calendar_connections WHERE user_id=$1 AND state='connected'",
      [userId],
    )
  ).rows[0];
  if (!connection) return;
  const row = await transaction(async (tx) => {
    const role = await learnerAccess(
      tx,
      { id: userId, email: "", emailVerified: true },
      familyId,
      learnerId,
    );
    requireThat(
      role === "student",
      "FORBIDDEN",
      "Student calendar access required.",
      403,
    );
    return (
      await tx.query("SELECT * FROM enrolments WHERE id=$1 AND learner_id=$2", [
        enrolmentId,
        learnerId,
      ])
    ).rows[0];
  }, familyId);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: decryptToken(connection.encrypted_token),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    await database().query(
      "UPDATE calendar_connections SET state='reconnect' WHERE user_id=$1",
      [userId],
    );
    throw new Error("CALENDAR_RECONNECT");
  }
  const token = (await response.json()).access_token;
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendar_id)}/events`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const exams = (row?.data.examDates ?? []).filter((e: any) => e.confirmed);
  const units = [
    ...new Set<string>([
      ...previousUnits,
      ...(row?.data.examDates ?? []).map((e: any) => e.unit),
    ]),
  ];
  const reminders = calendarReminderOverrides(
    (await calendarPreferences(userId)).calendarTiming,
  );
  for (const unit of units) {
    const id =
      // Google event IDs use base32hex: lowercase a-v and digits only.
      "sve" +
      createHash("sha256")
        .update(`${userId}:${enrolmentId}:${unit}`)
        .digest("hex");
    const exam = exams.find((e: any) => e.unit === unit);
    if (!exam) {
      const r = await fetch(`${base}/${id}`, { method: "DELETE", headers });
      requireThat(
        r.ok || r.status === 404 || r.status === 410,
        "CALENDAR_FAILURE",
        "Exam calendar cancellation failed.",
      );
      continue;
    }
    const end = new Date(exam.date + "T12:00:00Z");
    end.setUTCDate(end.getUTCDate() + 1);
    const body = JSON.stringify({
      id,
      summary: `${row.data.subject} · ${unit} exam`,
      start: { date: exam.date },
      end: { date: end.toISOString().slice(0, 10) },
      reminders,
      description: `Confirmed exam date. Sitting time is not recorded. Open your diary: ${process.env.BETTER_AUTH_URL}/?page=Plan&family=${familyId}&date=${exam.date}`,
    });
    let result = await fetch(base, { method: "POST", headers, body });
    if (result.status === 409)
      result = await fetch(`${base}/${id}`, { method: "PUT", headers, body });
    requireThat(
      result.ok,
      "CALENDAR_FAILURE",
      "Exam calendar publishing failed. Your in-app diary is saved.",
    );
  }
}
