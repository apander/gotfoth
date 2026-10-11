import { Pool, type PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { isSuperuser } from "../lib/domain";
import { missing, requireThat } from "../lib/errors";
import { requireNeonUrl } from "../lib/neon-url";
export type Actor = { id: string; email: string; emailVerified: boolean };
export type Tx = Pick<PoolClient, "query">;
let pool: Pool | undefined;
export function database() {
  requireThat(
    process.env.DATABASE_URL,
    "SETUP_REQUIRED",
    "Database setup is required.",
    503,
  );
  return (pool ??= new Pool({
    connectionString: requireNeonUrl(process.env.DATABASE_URL, "DATABASE_URL"),
    max: 5,
  }));
}
export async function transaction<T>(
  fn: (tx: Tx) => Promise<T>,
  familyId?: string,
) {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    if (process.env.NODE_ENV === "production") {
      const role = (
        await client.query(
          "SELECT rolsuper OR rolbypassrls OR EXISTS(SELECT 1 FROM pg_class WHERE oid='learners'::regclass AND relowner=pg_roles.oid) AS unsafe FROM pg_roles WHERE rolname=current_user",
        )
      ).rows[0];
      requireThat(
        role && !role.unsafe,
        "DATABASE_ROLE",
        "Configure the restricted application database role.",
        503,
      );
    }
    if (familyId)
      await client.query("SELECT set_config('app.family_id',$1,true)", [
        familyId,
      ]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function accountIsSuperuser(actor: Actor) {
  if (!actor.emailVerified) return false;
  if (isSuperuser(actor.email, actor.emailVerified)) return true;
  const row = await database().query(
    "SELECT 1 FROM superusers WHERE email=lower($1)",
    [actor.email],
  );
  return Boolean(row.rowCount);
}
export async function superuser(actor: Actor) {
  requireThat(
    await accountIsSuperuser(actor),
    "FORBIDDEN",
    "Administrator access required.",
    403,
  );
}
export async function family<T>(
  actor: Actor,
  familyId: string,
  fn: (tx: Tx, role: string) => Promise<T>,
) {
  return transaction(async (tx) => {
    const f = await tx.query(
      "SELECT suspended,deleted_at FROM families WHERE id=$1",
      [familyId],
    );
    if (!f.rows[0] || f.rows[0].suspended || f.rows[0].deleted_at)
      throw missing();
    const membership = await tx.query(
      "SELECT role FROM memberships WHERE user_id=$1 AND family_id=$2 AND active",
      [actor.id, familyId],
    );
    let role = membership.rows[0]?.role as string | undefined;
    if (!role) {
      if (!(await accountIsSuperuser(actor))) throw missing();
      role = "parent";
    }
    return fn(tx, role);
  }, familyId);
}
export async function learnerAccess(
  tx: Tx,
  actor: Actor,
  familyId: string,
  learnerId: string,
  parentOnly = false,
) {
  const result = await tx.query(
    `SELECT m.role FROM memberships m WHERE m.user_id=$1 AND m.family_id=$2 AND m.active AND
    ((m.role='student' AND m.learner_id=$3 AND NOT $4) OR (m.role='parent' AND EXISTS(SELECT 1 FROM learners l WHERE l.id=$3 AND l.family_id=m.family_id)))`,
    [actor.id, familyId, learnerId, parentOnly],
  );
  if (!result.rows.length) throw missing();
  return result.rows[0].role as string;
}
export async function audit(
  tx: Tx,
  actorId: string,
  action: string,
  data: unknown,
  familyId?: string,
) {
  await tx.query(
    "INSERT INTO audit_events(id,family_id,actor_id,action,data) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), familyId ?? null, actorId, action, JSON.stringify(data)],
  );
}
export async function enqueue(
  tx: Tx,
  kind: string,
  key: string,
  data: unknown,
  familyId?: string,
) {
  await tx.query(
    "INSERT INTO outbox(id,family_id,kind,key,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT(key) DO NOTHING",
    [randomUUID(), familyId ?? null, kind, key, JSON.stringify(data)],
  );
}
