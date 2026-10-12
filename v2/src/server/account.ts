import { z } from "zod";
import { transaction, type Actor, type Tx } from "./db";
import { isSuperuser } from "../lib/domain";
import { AppError, requireThat } from "../lib/errors";

const nameField = z.string().trim().min(1).max(100);

export async function accountView(actor: Actor) {
  return transaction(async (tx) => {
    const user = await tx.query('SELECT name, email FROM "user" WHERE id=$1', [
      actor.id,
    ]);
    const memberships = await tx.query(
      `SELECT f.name AS family, m.role
       FROM memberships m
       JOIN families f ON f.id=m.family_id
       WHERE m.user_id=$1 AND m.active AND f.deleted_at IS NULL
       ORDER BY lower(f.name), m.role`,
      [actor.id],
    );
    const operator = await tx.query("SELECT 1 FROM superusers WHERE email=lower($1)", [
      actor.email,
    ]);
    return {
      name: user.rows[0]?.name ?? "",
      email: actor.email,
      superuser:
        actor.emailVerified &&
        (isSuperuser(actor.email, actor.emailVerified) || Boolean(operator.rowCount)),
      memberships: memberships.rows,
    };
  });
}

export async function updateAccountInTransaction(
  tx: Tx,
  actor: Actor,
  name: string,
) {
  const clean = nameField.parse(name);
  const updated = await tx.query(
    'UPDATE "user" SET name=$2, "updatedAt"=now() WHERE id=$1 RETURNING id',
    [actor.id, clean],
  );
  if (!updated.rows.length)
    throw new AppError("NOT_FOUND", "This account is unavailable.", 404);
  await tx.query("UPDATE memberships SET display_name=$2 WHERE user_id=$1", [
    actor.id,
    clean,
  ]);
  const learners = await tx.query(
    "SELECT family_id, learner_id FROM memberships WHERE user_id=$1 AND role='student' AND learner_id IS NOT NULL",
    [actor.id],
  );
  for (const row of learners.rows) {
    await tx.query("SELECT set_config('app.family_id',$1,true)", [row.family_id]);
    await tx.query("UPDATE learners SET name=$2 WHERE id=$1 AND family_id=$3", [
      row.learner_id,
      clean,
      row.family_id,
    ]);
  }
  return { name: clean };
}

export async function updateAccount(actor: Actor, input: unknown) {
  const name = z.object({ name: nameField }).parse(input).name;
  await transaction((tx) => updateAccountInTransaction(tx, actor, name));
  return accountView(actor);
}

export async function deleteAccountInTransaction(
  tx: Tx,
  actor: Actor,
  email: string,
) {
  requireThat(
    email.trim().toLowerCase() === actor.email.toLowerCase(),
    "CONFIRM",
    "Type your email address to confirm deletion.",
  );
  await tx.query("DELETE FROM parent_links WHERE user_id=$1", [actor.id]);
  await tx.query("DELETE FROM memberships WHERE user_id=$1", [actor.id]);
  await tx.query("DELETE FROM calendar_connections WHERE user_id=$1", [actor.id]);
  await tx.query("UPDATE invitations SET accepted_by=NULL WHERE accepted_by=$1", [
    actor.id,
  ]);
  await tx.query("UPDATE catalogue SET approved_by=NULL WHERE approved_by=$1", [
    actor.id,
  ]);
  await tx.query("DELETE FROM superusers WHERE email=lower($1)", [actor.email]);
  await tx.query(
    "DELETE FROM verification WHERE lower(identifier)=lower($1) OR value=$2",
    [actor.email, actor.id],
  );
  try {
    const removed = await tx.query('DELETE FROM "user" WHERE id=$1 RETURNING id', [
      actor.id,
    ]);
    if (!removed.rows.length)
      throw new AppError("NOT_FOUND", "This account is unavailable.", 404);
  } catch (error) {
    if (error instanceof AppError) throw error;
    if ((error as { code?: string }).code === "23503")
      throw new AppError(
        "ACCOUNT_IN_USE",
        "This account is linked to records that have to be kept.",
        409,
      );
    throw error;
  }
  return { deleted: true };
}

export async function deleteAccount(actor: Actor, input: unknown) {
  const email = z.object({ email: z.email() }).parse(input).email;
  return transaction((tx) => deleteAccountInTransaction(tx, actor, email));
}
