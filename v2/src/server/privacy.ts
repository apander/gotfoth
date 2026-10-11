import type { Tx } from "./db";
/** Owner-only maintenance path. Never exposed through application routes or the runtime connection. */
export async function purgeFamily(tx: Tx, familyId: string) {
  const family = (
    await tx.query(
      "SELECT id FROM families WHERE id=$1 AND deleted_at IS NOT NULL FOR UPDATE",
      [familyId],
    )
  ).rows[0];
  if (!family)
    throw new Error("Only an explicitly deleted family can be purged.");
  const owner = (
    await tx.query(
      "SELECT current_user=pg_get_userbyid(relowner) AS allowed FROM pg_class WHERE oid='submissions'::regclass",
    )
  ).rows[0];
  if (!owner.allowed)
    throw new Error("Privacy purge requires the owner maintenance connection.");
  await tx.query(
    "SELECT set_config('app.family_id',$1,true),set_config('app.privacy_purge','true',true)",
    [familyId],
  );
  const users = (
    await tx.query("SELECT user_id FROM memberships WHERE family_id=$1", [
      familyId,
    ])
  ).rows.map((r) => r.user_id);
  // Retain only pseudonymous financial entries, payment references and their exact monetary amounts.
  await tx.query("UPDATE ledger SET learner_id=NULL WHERE family_id=$1", [
    familyId,
  ]);
  await tx.query("DELETE FROM usage_events WHERE family_id=$1", [familyId]);
  for (const table of [
    "corrective_tasks",
    "review_decisions",
    "assessments",
    "recovered_work",
    "submissions",
    "reservations",
    "quotes",
    "answers",
    "study_sessions",
    "attempts",
    "exposure",
    "enrolments",
    "catalogue_releases",
    "parent_links",
    "invitations",
    "memberships",
    "learners",
    "outbox",
    "audit_events",
  ])
    await tx.query(`DELETE FROM ${table} WHERE family_id=$1`, [familyId]);
  await tx.query(
    "UPDATE families SET name='Deleted family',suspended=true WHERE id=$1",
    [familyId],
  );
  for (const userId of users) {
    const remains = (
      await tx.query("SELECT user_id FROM memberships WHERE user_id=$1", [
        userId,
      ])
    ).rows.length;
    if (!remains) {
      await tx.query("DELETE FROM calendar_connections WHERE user_id=$1", [
        userId,
      ]);
      await tx.query("DELETE FROM verification WHERE value=$1", [userId]);
      // Retain operator identities referenced by catalogue approvals, invitations or evaluations.
      const references = (
        await tx.query(
          "SELECT id FROM catalogue WHERE approved_by=$1 UNION ALL SELECT id FROM invitations WHERE created_by=$1 OR accepted_by=$1 UNION ALL SELECT id FROM course_evaluations WHERE approved_by=$1",
          [userId],
        )
      ).rows.length;
      if (!references)
        await tx.query('DELETE FROM "user" WHERE id=$1', [userId]);
    }
  }
  await tx.query(
    "INSERT INTO operational_checks(key,data) VALUES($1,jsonb_build_object('purgedAt',now())) ON CONFLICT(key) DO UPDATE SET data=EXCLUDED.data,checked_at=now()",
    [`purge:${familyId}`],
  );
}
