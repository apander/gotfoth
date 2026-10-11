import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type Tx, audit } from "./db";
import { requireThat } from "../lib/errors";
export const RateCard = z.object({
  label: z.string().min(1),
  model: z.string().min(1),
  reviewModel: z.string().min(1),
  promptVersion: z.string().min(1),
  inputMicrosPerMillion: z.number().int().nonnegative(),
  outputMicrosPerMillion: z.number().int().positive(),
  reviewInputMicrosPerMillion: z.number().int().nonnegative(),
  reviewOutputMicrosPerMillion: z.number().int().positive(),
  maxOutputTokens: z.number().int().min(500).max(8000),
  maxAnswerChars: z.number().int().min(1000).max(50000),
  markupBasisPoints: z.number().int().min(10000).max(30000),
});
export type RateCard = z.infer<typeof RateCard>;
export function tokenCost(
  input: number,
  output: number,
  rate: RateCard,
  review = false,
) {
  return Math.ceil(
    (input *
      (review ? rate.reviewInputMicrosPerMillion : rate.inputMicrosPerMillion) +
      output *
        (review
          ? rate.reviewOutputMicrosPerMillion
          : rate.outputMicrosPerMillion)) /
      1_000_000,
  );
}
export async function createQuote(
  tx: Tx,
  attempt: { id: string; family_id: string; learner_id: string; data: any },
) {
  const result = await tx.query(
    "SELECT * FROM rate_cards WHERE active ORDER BY created_at DESC LIMIT 1",
  );
  requireThat(
    result.rows[0],
    "RATE_REQUIRED",
    "A validated marking rate card is required before starting paid work.",
    503,
  );
  const rate = RateCard.parse(result.rows[0].data);
  // UTF-8 byte upper bound is conservative for tokenisation; include both independent passes for every answer.
  const contextBytes =
    Buffer.byteLength(
      JSON.stringify({
        questions: attempt.data.questions,
        resources: attempt.data.resources,
        generalRubrics: attempt.data.generalRubrics,
      }),
      "utf8",
    ) *
      attempt.data.questions.length +
    8000 * attempt.data.questions.length;
  const input =
    contextBytes + 4 * rate.maxAnswerChars * attempt.data.questions.length;
  const output = rate.maxOutputTokens * attempt.data.questions.length;
  const maxCharge = Math.ceil(
    ((tokenCost(input, output, rate) + tokenCost(input, output, rate, true)) *
      rate.markupBasisPoints) /
      10000,
  );
  const id = randomUUID();
  await tx.query(
    "INSERT INTO quotes(id,family_id,learner_id,attempt_id,max_charge,rate_card_id,configuration,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '15 minutes')",
    [
      id,
      attempt.family_id,
      attempt.learner_id,
      attempt.id,
      maxCharge,
      result.rows[0].id,
      JSON.stringify(rate),
    ],
  );
  return { id, maxChargeMicros: maxCharge, expiresInSeconds: 900 };
}
export async function reserve(tx: Tx, quoteId: string, allowAccepted = false) {
  const q = (
    await tx.query("SELECT * FROM quotes WHERE id=$1 FOR UPDATE", [quoteId])
  ).rows[0];
  requireThat(
    q &&
      ((allowAccepted && q.accepted_at) || new Date(q.expires_at) > new Date()),
    "QUOTE_EXPIRED",
    "Request a new processing quote.",
  );
  const existing = (
    await tx.query("SELECT * FROM reservations WHERE quote_id=$1", [quoteId])
  ).rows[0];
  if (existing && (!existing.released_at || existing.settled !== null))
    return existing;
  const account = (
    await tx.query(
      "SELECT balance FROM funding_accounts WHERE family_id=$1 FOR UPDATE",
      [q.family_id],
    )
  ).rows[0];
  const learner = (
    await tx.query("SELECT monthly_cap FROM learners WHERE id=$1 FOR UPDATE", [
      q.learner_id,
    ])
  ).rows[0];
  const month = new Date().toISOString().slice(0, 7);
  const pending = await tx.query(
    "SELECT COALESCE(sum(amount),0) AS amount FROM reservations WHERE family_id=$1 AND settled IS NULL AND released_at IS NULL",
    [q.family_id],
  );
  const spent = await tx.query(
    "SELECT COALESCE(sum(CASE WHEN settled IS NULL AND released_at IS NULL THEN amount ELSE COALESCE(settled,0) END),0) AS amount FROM reservations WHERE learner_id=$1 AND month=$2",
    [q.learner_id, month],
  );
  requireThat(
    Number(account.balance) - Number(pending.rows[0].amount) >=
      Number(q.max_charge),
    "AWAITING_FUNDS",
    "Your work is saved. A parent needs to add family credit.",
  );
  requireThat(
    Number(learner.monthly_cap) - Number(spent.rows[0].amount) >=
      Number(q.max_charge),
    "STUDENT_CAP",
    "Your work is saved. A parent needs to adjust the monthly spending cap.",
  );
  const id = existing?.id ?? randomUUID();
  if (existing)
    await tx.query(
      "UPDATE reservations SET released_at=NULL,month=$2 WHERE id=$1",
      [id, month],
    );
  else
    await tx.query(
      "INSERT INTO reservations(id,family_id,learner_id,quote_id,amount,month) VALUES($1,$2,$3,$4,$5,$6)",
      [id, q.family_id, q.learner_id, q.id, q.max_charge, month],
    );
  await tx.query("UPDATE quotes SET accepted_at=now() WHERE id=$1", [q.id]);
  return { id, amount: q.max_charge, quote_id: q.id };
}
export async function settle(tx: Tx, quoteId: string, charge: number) {
  const r = (
    await tx.query("SELECT * FROM reservations WHERE quote_id=$1 FOR UPDATE", [
      quoteId,
    ])
  ).rows[0];
  requireThat(
    r,
    "RESERVATION_REQUIRED",
    "A processing reservation is required.",
  );
  if (r.settled !== null) return;
  requireThat(
    (!r.released_at || charge === 0) &&
      Number.isSafeInteger(charge) &&
      charge >= 0 &&
      charge <= Number(r.amount),
    "CHARGE_LIMIT",
    "Charge exceeds the authorised maximum.",
  );
  await tx.query(
    "SELECT family_id FROM funding_accounts WHERE family_id=$1 FOR UPDATE",
    [r.family_id],
  );
  await tx.query(
    "UPDATE reservations SET settled=$2,released_at=now() WHERE id=$1",
    [r.id, charge],
  );
  await tx.query(
    "INSERT INTO ledger(id,family_id,learner_id,amount,kind,idempotency_key,reference) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      randomUUID(),
      r.family_id,
      r.learner_id,
      -charge,
      "marking",
      `settle:${r.id}`,
      r.id,
    ],
  );
  await tx.query(
    "UPDATE funding_accounts SET balance=balance-$2 WHERE family_id=$1",
    [r.family_id, charge],
  );
}
export async function credit(
  tx: Tx,
  familyId: string,
  amount: number,
  key: string,
  reference: string,
  kind = "payment",
) {
  requireThat(Number.isSafeInteger(amount), "AMOUNT", "Invalid amount.");
  await tx.query(
    "SELECT family_id FROM funding_accounts WHERE family_id=$1 FOR UPDATE",
    [familyId],
  );
  const insert = await tx.query(
    "INSERT INTO ledger(id,family_id,amount,kind,idempotency_key,reference) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id",
    [randomUUID(), familyId, amount, kind, key, reference],
  );
  if (insert.rows.length)
    await tx.query(
      "UPDATE funding_accounts SET balance=balance+$2 WHERE family_id=$1",
      [familyId, amount],
    );
}
export async function release(tx: Tx, quoteId: string) {
  await tx.query(
    "UPDATE reservations SET released_at=now() WHERE quote_id=$1 AND settled IS NULL AND released_at IS NULL",
    [quoteId],
  );
}
