import { randomUUID, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import {
  database,
  transaction,
  superuser,
  audit,
  type Actor,
  type Tx,
} from "./db";
import { requireThat, missing } from "../lib/errors";
import { Paper } from "../lib/contracts";
import { validatePaper } from "../lib/domain";
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function createFamily(actor: Actor, input: unknown) {
  await superuser(actor);
  const data = z
    .object({
      name: z.string().min(1).max(100),
      learners: z.array(z.string().min(1).max(100)).min(1).max(20),
    })
    .parse(input);
  const id = randomUUID();
  return transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(820025)");
    const existing = await tx.query(
      "SELECT count(*) FROM families WHERE deleted_at IS NULL",
    );
    if (Number(existing.rows[0].count) > 0) {
      const restore = await tx.query(
        "SELECT 1 FROM operational_checks WHERE key='restore_test' AND checked_at>now()-interval '30 days'",
      );
      requireThat(
        restore.rows.length,
        "RESTORE_REQUIRED",
        "Record a successful restore test before onboarding another family.",
      );
    }
    await tx.query("INSERT INTO families(id,name) VALUES($1,$2)", [
      id,
      data.name,
    ]);
    await tx.query("INSERT INTO funding_accounts(family_id) VALUES($1)", [id]);
    for (const name of data.learners)
      await tx.query(
        "INSERT INTO learners(id,family_id,name) VALUES($1,$2,$3)",
        [randomUUID(), id, name],
      );
    await audit(tx, actor.id, "family.created", { id }, id);
    return { id };
  }, id);
}
export async function invite(actor: Actor, input: unknown) {
  await superuser(actor);
  const data = z
    .object({
      familyId: z.string().uuid(),
      email: z.email(),
      role: z.enum(["parent", "student", "teacher"]),
      learnerId: z.string().uuid().nullable().optional(),
    })
    .parse(input);
  const token = randomBytes(32).toString("base64url"),
    id = randomUUID();
  const learnerId = data.role === "teacher" ? null : (data.learnerId ?? null);
  await transaction(async (tx) => {
    requireThat(
      data.role === "teacher" || learnerId,
      "LEARNER",
      "Choose the learner this invitation is for.",
    );
    if (learnerId) {
      const learner = await tx.query(
        "SELECT id FROM learners WHERE id=$1 AND family_id=$2",
        [learnerId, data.familyId],
      );
      if (!learner.rows.length) throw missing();
    }
    await tx.query(
      "INSERT INTO invitations(id,token_hash,email,family_id,role,learner_id,expires_at,created_by) VALUES($1,$2,lower($3),$4,$5,$6,now()+interval '7 days',$7)",
      [
        id,
        hash(token),
        data.email,
        data.familyId,
        data.role,
        learnerId,
        actor.id,
      ],
    );
    await audit(
      tx,
      actor.id,
      "invitation.issued",
      { invitationId: id, role: data.role },
      data.familyId,
    );
  }, data.familyId);
  return { id, url: `${process.env.BETTER_AUTH_URL}/?invite=${token}` };
}
export async function acceptInvitation(actor: Actor, token: string) {
  return transaction((tx) => acceptInvitationInTransaction(tx, actor, token));
}
export async function acceptInvitationInTransaction(
  tx: Tx,
  actor: Actor,
  token: string,
) {
  requireThat(
    actor.emailVerified,
    "VERIFIED_EMAIL",
    "A verified Google email is required.",
  );
  const result = await tx.query(
    "SELECT * FROM invitations WHERE token_hash=$1 FOR UPDATE",
    [hash(token)],
  );
  const inv = result.rows[0];
  requireThat(
    inv &&
      inv.email.toLowerCase() === actor.email.toLowerCase() &&
      !inv.revoked_at &&
      !inv.accepted_at &&
      new Date(inv.expires_at) > new Date(),
    "INVITATION_INVALID",
    "This invitation is invalid, expired, or already used.",
  );
  await tx.query("SELECT set_config('app.family_id',$1,true)", [inv.family_id]);
  const f = await tx.query(
    "SELECT id FROM families WHERE id=$1 AND NOT suspended AND deleted_at IS NULL",
    [inv.family_id],
  );
  if (!f.rows.length) throw missing();
  // Existing members cannot use a second invitation to silently change role or learner identity.
  await tx.query(
    "INSERT INTO memberships(user_id,family_id,role,learner_id) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,family_id) DO NOTHING",
    [
      actor.id,
      inv.family_id,
      inv.role,
      inv.role === "student" ? inv.learner_id : null,
    ],
  );
  const membership = await tx.query(
    "SELECT * FROM memberships WHERE user_id=$1 AND family_id=$2",
    [actor.id, inv.family_id],
  );
  requireThat(
    membership.rows[0].active &&
      membership.rows[0].role === inv.role &&
      (inv.role !== "student" ||
        membership.rows[0].learner_id === inv.learner_id),
    "MEMBERSHIP_CONFLICT",
    "This invitation conflicts with an existing membership.",
  );
  if (inv.role === "parent")
    await tx.query(
      "INSERT INTO parent_links(user_id,family_id,learner_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [actor.id, inv.family_id, inv.learner_id],
    );
  await tx.query(
    "UPDATE invitations SET accepted_at=now(),accepted_by=$2 WHERE id=$1",
    [inv.id, actor.id],
  );
  await audit(
    tx,
    actor.id,
    "invitation.accepted",
    { invitationId: inv.id },
    inv.family_id,
  );
  return { familyId: inv.family_id };
}
export async function adminSnapshot(actor: Actor) {
  await superuser(actor);
  const [families, invitations, catalogue, jobs, checks, rates] =
    await Promise.all([
      database().query("SELECT * FROM families ORDER BY created_at DESC"),
      database().query(
        "SELECT id,email,family_id,role,expires_at,revoked_at,accepted_at FROM invitations ORDER BY expires_at DESC LIMIT 100",
      ),
      database().query(
        "SELECT * FROM catalogue ORDER BY published_at DESC NULLS FIRST",
      ),
      database().query(
        "SELECT id,kind,state,attempts,last_error,created_at FROM outbox WHERE state<>'done' ORDER BY created_at LIMIT 100",
      ),
      database().query("SELECT * FROM operational_checks"),
      database().query("SELECT * FROM rate_cards ORDER BY created_at DESC"),
    ]);
  const familyRows = [];
  for (const f of families.rows) {
    const detail = await transaction(async (tx) => {
      const learners = await tx.query(
        "SELECT id,name FROM learners WHERE family_id=$1 ORDER BY name",
        [f.id],
      );
      const members = await tx.query(
        `SELECT u.email, m.role,
           COALESCE(l.name, (
             SELECT string_agg(pl.name, ', ' ORDER BY pl.name)
             FROM parent_links p
             JOIN learners pl ON pl.id=p.learner_id
             WHERE p.user_id=m.user_id AND p.family_id=m.family_id
           )) AS learner_name
         FROM memberships m
         JOIN "user" u ON u.id=m.user_id
         LEFT JOIN learners l ON l.id=m.learner_id
         WHERE m.family_id=$1 AND m.active
         ORDER BY u.email`,
        [f.id],
      );
      return { learners: learners.rows, members: members.rows };
    }, f.id);
    familyRows.push({ ...f, ...detail });
  }
  return {
    families: familyRows,
    invitations: invitations.rows,
    catalogue: catalogue.rows,
    jobs: jobs.rows,
    checks: checks.rows,
    rates: rates.rows,
  };
}
const memberInput = z.object({
  action: z.enum(["set", "remove"]),
  familyId: z.string().uuid(),
  email: z.email(),
  role: z.enum(["parent", "student", "teacher"]).optional(),
  learnerId: z.string().uuid().nullable().optional(),
});
export async function setMember(actor: Actor, input: unknown) {
  await superuser(actor);
  const data = memberInput.parse(input);
  return transaction(
    (tx) => setMemberInTransaction(tx, actor, data),
    data.familyId,
  );
}
export async function setMemberInTransaction(
  tx: Tx,
  actor: Actor,
  data: z.infer<typeof memberInput>,
) {
  await tx.query("SELECT set_config('app.family_id',$1,true)", [data.familyId]);
  const family = await tx.query(
    "SELECT id FROM families WHERE id=$1 AND deleted_at IS NULL",
    [data.familyId],
  );
  if (!family.rows.length) throw missing();
  const email = data.email.toLowerCase();
  if (data.action === "remove") {
    const member = await tx.query(
      'SELECT id FROM "user" WHERE lower(email)=$1',
      [email],
    );
    if (!member.rows.length) throw missing();
    await tx.query(
      "DELETE FROM parent_links WHERE user_id=$1 AND family_id=$2",
      [member.rows[0].id, data.familyId],
    );
    await tx.query(
      "DELETE FROM memberships WHERE user_id=$1 AND family_id=$2",
      [member.rows[0].id, data.familyId],
    );
    await audit(tx, actor.id, "member.removed", { email }, data.familyId);
    return { saved: true };
  }
  const role = data.role;
  requireThat(role, "ROLE", "Choose a role for this member.");
  const learnerId = role === "teacher" ? null : (data.learnerId ?? null);
  requireThat(
    role === "teacher" || learnerId,
    "LEARNER",
    "Choose the learner this member is linked to.",
  );
  if (learnerId) {
    const learner = await tx.query(
      "SELECT id FROM learners WHERE id=$1 AND family_id=$2",
      [learnerId, data.familyId],
    );
    if (!learner.rows.length) throw missing();
  }
  const user = await tx.query('SELECT id FROM "user" WHERE lower(email)=$1', [
    email,
  ]);
  if (!user.rows.length) {
    const token = randomBytes(32).toString("base64url");
    await tx.query(
      "INSERT INTO invitations(id,token_hash,email,family_id,role,learner_id,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,now()+interval '7 days',$7)",
      [
        randomUUID(),
        hash(token),
        email,
        data.familyId,
        role,
        role === "teacher" ? null : learnerId,
        actor.id,
      ],
    );
    await audit(tx, actor.id, "member.invited", { email, role }, data.familyId);
    return { url: `${process.env.BETTER_AUTH_URL}/?invite=${token}` };
  }
  await tx.query(
    `INSERT INTO memberships(user_id,family_id,role,learner_id,active)
     VALUES($1,$2,$3,$4,true)
     ON CONFLICT(user_id,family_id) DO UPDATE
     SET role=EXCLUDED.role, learner_id=EXCLUDED.learner_id, active=true`,
    [user.rows[0].id, data.familyId, role, role === "student" ? learnerId : null],
  );
  await tx.query("DELETE FROM parent_links WHERE user_id=$1 AND family_id=$2", [
    user.rows[0].id,
    data.familyId,
  ]);
  if (role === "parent" && learnerId)
    await tx.query(
      "INSERT INTO parent_links(user_id,family_id,learner_id) VALUES($1,$2,$3)",
      [user.rows[0].id, data.familyId, learnerId],
    );
  await audit(tx, actor.id, "member.updated", { email, role }, data.familyId);
  return { saved: true };
}
export async function catalogueAction(actor: Actor, input: unknown) {
  await superuser(actor);
  const data = z
    .object({
      id: z.string().uuid(),
      action: z.enum(["save", "approve", "publish"]),
      paper: Paper.optional(),
    })
    .parse(input);
  return transaction(async (tx) => {
    const result = await tx.query(
      "SELECT * FROM catalogue WHERE id=$1 FOR UPDATE",
      [data.id],
    );
    const row = result.rows[0];
    if (!row) throw missing();
    requireThat(
      row.status !== "published",
      "IMMUTABLE",
      "Create a new version to correct published material.",
    );
    const paper = Paper.parse(data.paper ?? row.data),
      issues = validatePaper(paper);
    const sources = (
      await tx.query(
        "SELECT id,metadata FROM source_documents WHERE id=ANY($1::uuid[])",
        [paper.sourceIds],
      )
    ).rows;
    const sourcePaper = sources.find((s) => s.metadata.type === "paper"),
      scheme = sources.find((s) => s.metadata.type === "scheme");
    if (
      sources.length !== new Set(paper.sourceIds).size ||
      !sourcePaper ||
      !scheme
    )
      issues.push(
        "A complete original paper and matching scheme are required.",
      );
    for (const source of sources.filter((s) =>
      ["paper", "scheme"].includes(s.metadata.type),
    )) {
      const m = source.metadata;
      if (
        m.unit !== paper.unit.replace("/01", "") ||
        m.year !== paper.year ||
        m.session !== paper.session ||
        m.variant !== paper.variant
      )
        issues.push("Source identity does not match the structured paper.");
    }
    for (const q of paper.questions) {
      if (
        sourcePaper &&
        q.pages.some((p) => p > sourcePaper.metadata.pageCount)
      )
        issues.push(
          `Question ${q.number} references an unavailable source page.`,
        );
      if (scheme && q.rubric.pages.some((p) => p > scheme.metadata.pageCount))
        issues.push(
          `Question ${q.number} references an unavailable rubric page.`,
        );
    }
    for (const resource of paper.resources)
      if (
        resource.fileId &&
        !sources.some(
          (s) => s.id === resource.fileId && s.metadata.type === "paper",
        )
      )
        issues.push(
          "Student resources may link only to this paper’s original question document.",
        );
    requireThat(
      paper.id === row.id && paper.version === row.version,
      "IDENTITY",
      "Paper version identity cannot change.",
    );
    if (data.action === "save")
      await tx.query(
        "UPDATE catalogue SET data=$2,issues=$3,status='needs_review',approved_by=NULL,approved_at=NULL WHERE id=$1",
        [data.id, JSON.stringify(paper), JSON.stringify(issues)],
      );
    if (data.action === "approve") {
      requireThat(!issues.length, "VALIDATION", issues.join(" "));
      await tx.query(
        "UPDATE catalogue SET data=$2,issues='[]',status='approved',approved_by=$3,approved_at=now() WHERE id=$1",
        [data.id, JSON.stringify(paper), actor.id],
      );
    }
    if (data.action === "publish") {
      requireThat(
        row.status === "approved" && !data.paper,
        "APPROVAL_REQUIRED",
        "Publish the approved content without changes.",
      );
      requireThat(
        paper.permissionConfirmed,
        "PERMISSION_REQUIRED",
        "Confirm catalogue distribution permission before publication.",
      );
      requireThat(!issues.length, "VALIDATION", issues.join(" "));
      await tx.query(
        "UPDATE catalogue SET status='published',published_at=now() WHERE id=$1",
        [data.id],
      );
    }
    await audit(tx, actor.id, `catalogue.${data.action}`, { id: data.id });
    return { id: data.id, issues };
  });
}
