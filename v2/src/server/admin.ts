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
import { requireThat, missing, AppError } from "../lib/errors";
import { Paper } from "../lib/contracts";
import { validatePaper } from "../lib/domain";
import { deliverWelcome, welcomeLetter } from "./mail";
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const learnerName = z.string().trim().min(1).max(100);
const learnerRecord = z.object({
  id: z.string().uuid().optional(),
  name: learnerName,
  email: z.string().trim().max(200).optional(),
});
const familyChange = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: learnerName,
    learners: z.array(learnerRecord).min(1).max(20),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().uuid(),
    name: learnerName,
    suspended: z.boolean(),
    learners: z.array(learnerRecord).max(20),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().uuid(),
  }),
]);
function cleanEmail(value?: string | null) {
  const email = value?.trim().toLowerCase() ?? "";
  if (!email) return null;
  requireThat(z.email().safeParse(email).success, "EMAIL", "Enter a valid email address.");
  return email;
}
async function assertLearnerEmailFree(tx: Tx, email: string | null, learnerId: string) {
  if (!email) return;
  const taken = await tx.query(
    "SELECT id FROM learners WHERE lower(email)=lower($1) AND id<>$2",
    [email, learnerId],
  );
  requireThat(taken.rows.length === 0, "EMAIL", "That student email is already used.");
}
async function learnerIsFree(tx: Tx, learnerId: string) {
  const linked = await tx.query(
    `SELECT
       (SELECT count(*) FROM memberships WHERE learner_id=$1) +
       (SELECT count(*) FROM invitations WHERE learner_id=$1) +
       (SELECT count(*) FROM enrolments WHERE learner_id=$1) +
       (SELECT count(*) FROM attempts WHERE learner_id=$1) +
       (SELECT count(*) FROM exposure WHERE learner_id=$1) +
       (SELECT count(*) FROM recovered_work WHERE learner_id=$1) +
       (SELECT count(*) FROM reservations WHERE learner_id=$1) +
       (SELECT count(*) FROM ledger WHERE learner_id=$1) +
       (SELECT count(*) FROM study_sessions WHERE learner_id=$1)
       AS total`,
    [learnerId],
  );
  return Number(linked.rows[0].total) === 0;
}
export async function saveFamily(actor: Actor, input: unknown) {
  await superuser(actor);
  const data = familyChange.parse(input);
  const id = data.action === "create" ? randomUUID() : data.id;
  return transaction((tx) => saveFamilyInTransaction(tx, actor, data, id), id);
}
export async function saveFamilyInTransaction(
  tx: Tx,
  actor: Actor,
  data: z.infer<typeof familyChange>,
  id: string,
) {
  if (data.action === "delete") {
    const removed = await tx.query(
      "UPDATE families SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id",
      [id],
    );
    if (!removed.rows.length) throw missing();
    await audit(tx, actor.id, "family.deleted", { id }, id);
    return { id };
  }
  if (data.action === "create") {
    await tx.query("INSERT INTO families(id,name) VALUES($1,$2)", [id, data.name]);
    await tx.query("INSERT INTO funding_accounts(family_id) VALUES($1)", [id]);
    const learners = [];
    for (const learner of data.learners) {
      const learnerId = randomUUID();
      const email = cleanEmail(learner.email);
      await assertLearnerEmailFree(tx, email, learnerId);
      await tx.query(
        "INSERT INTO learners(id,family_id,name,email) VALUES($1,$2,$3,$4)",
        [learnerId, id, learner.name, email],
      );
      learners.push({ id: learnerId, name: learner.name, email });
    }
    await audit(tx, actor.id, "family.created", { id }, id);
    return { id, learners };
  }
  const family = await tx.query(
    "UPDATE families SET name=$2, suspended=$3 WHERE id=$1 AND deleted_at IS NULL RETURNING id",
    [id, data.name, data.suspended],
  );
  if (!family.rows.length) throw missing();
  const existing = await tx.query(
    "SELECT id,name,email FROM learners WHERE family_id=$1",
    [id],
  );
  const kept = new Set(data.learners.flatMap((learner) => (learner.id ? [learner.id] : [])));
  for (const row of existing.rows) {
    if (kept.has(row.id)) continue;
    await tx.query("DELETE FROM parent_links WHERE learner_id=$1", [row.id]);
    await tx.query(
      "UPDATE invitations SET revoked_at=now(), learner_id=NULL WHERE learner_id=$1 AND accepted_at IS NULL",
      [row.id],
    );
    await tx.query("DELETE FROM memberships WHERE learner_id=$1 AND role='student'", [row.id]);
    requireThat(
      await learnerIsFree(tx, row.id),
      "LEARNER_IN_USE",
      `${row.name} is linked to members or study records.`,
    );
    await tx.query("DELETE FROM learners WHERE id=$1 AND family_id=$2", [row.id, id]);
  }
  const learners = [];
  for (const learner of data.learners) {
    const email = cleanEmail(learner.email);
    const learnerId = learner.id ?? randomUUID();
    await assertLearnerEmailFree(tx, email, learnerId);
    if (!learner.id) {
      await tx.query(
        "INSERT INTO learners(id,family_id,name,email) VALUES($1,$2,$3,$4)",
        [learnerId, id, learner.name, email],
      );
    } else {
      const owned = await tx.query(
        "UPDATE learners SET name=$3, email=$4 WHERE id=$1 AND family_id=$2 RETURNING id",
        [learner.id, id, learner.name, email],
      );
      if (!owned.rows.length) throw missing();
    }
    learners.push({ id: learnerId, name: learner.name, email });
  }
  await tx.query(
    `INSERT INTO parent_links(user_id,family_id,learner_id)
     SELECT m.user_id, m.family_id, l.id
     FROM memberships m
     JOIN learners l ON l.family_id=m.family_id
     WHERE m.family_id=$1 AND m.role='parent' AND m.active
     ON CONFLICT DO NOTHING`,
    [id],
  );
  await audit(tx, actor.id, "family.updated", { id }, id);
  return { id, learners };
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
  const learnerId = data.role === "student" ? (data.learnerId ?? null) : null;
  await transaction(async (tx) => {
    requireThat(
      data.role !== "student" || learnerId,
      "LEARNER",
      "Choose the student this invitation is for.",
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
  await assertOneStudentFamily(tx, actor.id, inv.family_id, inv.role);
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
  if (inv.display_name)
    await tx.query(
      "UPDATE memberships SET display_name=$3 WHERE user_id=$1 AND family_id=$2 AND display_name IS NULL",
      [actor.id, inv.family_id, inv.display_name],
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
      `INSERT INTO parent_links(user_id,family_id,learner_id)
       SELECT $1, $2, id FROM learners WHERE family_id=$2
       ON CONFLICT DO NOTHING`,
      [actor.id, inv.family_id],
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
      database().query(
        "SELECT * FROM families WHERE deleted_at IS NULL ORDER BY lower(name)",
      ),
      database().query(
        "SELECT id,email,display_name,family_id,role,learner_id,expires_at,revoked_at,accepted_at FROM invitations ORDER BY expires_at DESC LIMIT 100",
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
        "SELECT id,name,email FROM learners WHERE family_id=$1 ORDER BY name",
        [f.id],
      );
      const members = await tx.query(
        `SELECT u.email, COALESCE(m.display_name, u.name) AS name, m.role,
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
    const invites = invitations.rows.filter(
      (invite) =>
        invite.family_id === f.id &&
        !invite.accepted_at &&
        !invite.revoked_at &&
        new Date(invite.expires_at) > new Date(),
    );
    familyRows.push({ ...f, ...detail, invites });
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
async function assertOneStudentFamily(
  tx: Tx,
  userId: string,
  familyId: string,
  role: string,
) {
  const other = await tx.query(
    role === "student"
      ? "SELECT 1 FROM memberships WHERE user_id=$1 AND active AND family_id<>$2"
      : "SELECT 1 FROM memberships WHERE user_id=$1 AND role='student' AND active AND family_id<>$2",
    [userId, familyId],
  );
  requireThat(
    other.rows.length === 0,
    "STUDENT_FAMILY",
    "A student belongs to one family.",
  );
}
const memberInput = z.object({
  action: z.enum(["set", "remove"]),
  familyId: z.string().uuid(),
  email: z.email(),
  name: z.string().trim().max(100).optional(),
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
    if (!member.rows.length) {
      const revoked = await tx.query(
        "UPDATE invitations SET revoked_at=now() WHERE family_id=$1 AND lower(email)=$2 AND accepted_at IS NULL RETURNING id",
        [data.familyId, email],
      );
      requireThat(revoked.rows.length, "NOT_FOUND", "This person is not in the family.", 404);
      await audit(tx, actor.id, "member.removed", { email }, data.familyId);
      return { saved: true };
    }
    await tx.query(
      "UPDATE invitations SET revoked_at=now() WHERE family_id=$1 AND lower(email)=$2 AND accepted_at IS NULL",
      [data.familyId, email],
    );
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
  const learnerId = role === "student" ? (data.learnerId ?? null) : null;
  requireThat(
    role !== "student" || learnerId,
    "LEARNER",
    "Choose the student this member is linked to.",
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
  if (user.rows.length)
    await assertOneStudentFamily(tx, user.rows[0].id, data.familyId, role);
  const displayName = data.name?.trim() || null;
  if (!user.rows.length) {
    const token = randomBytes(32).toString("base64url");
    const pending = await tx.query(
      `UPDATE invitations
       SET role=$3, learner_id=$4, display_name=$5, expires_at=now()+interval '7 days', revoked_at=NULL
       WHERE family_id=$1 AND lower(email)=$2 AND accepted_at IS NULL
       RETURNING id`,
      [data.familyId, email, role, role === "student" ? learnerId : null, displayName],
    );
    if (pending.rows.length) {
      await audit(tx, actor.id, "member.invited", { email, role }, data.familyId);
      return { saved: true };
    }
    await tx.query(
      "INSERT INTO invitations(id,token_hash,email,family_id,role,learner_id,display_name,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '7 days',$8)",
      [
        randomUUID(),
        hash(token),
        email,
        data.familyId,
        role,
        role === "student" ? learnerId : null,
        displayName,
        actor.id,
      ],
    );
    await audit(tx, actor.id, "member.invited", { email, role }, data.familyId);
    return { url: `${process.env.BETTER_AUTH_URL}/?invite=${token}` };
  }
  await tx.query(
    `INSERT INTO memberships(user_id,family_id,role,learner_id,active,display_name)
     VALUES($1,$2,$3,$4,true,$5)
     ON CONFLICT(user_id,family_id) DO UPDATE
     SET role=EXCLUDED.role, learner_id=EXCLUDED.learner_id, active=true,
         display_name=COALESCE(EXCLUDED.display_name, memberships.display_name)`,
    [user.rows[0].id, data.familyId, role, role === "student" ? learnerId : null, displayName],
  );
  await tx.query("DELETE FROM parent_links WHERE user_id=$1 AND family_id=$2", [
    user.rows[0].id,
    data.familyId,
  ]);
  if (role === "parent")
    await tx.query(
      `INSERT INTO parent_links(user_id,family_id,learner_id)
       SELECT $1, $2, id FROM learners WHERE family_id=$2
       ON CONFLICT DO NOTHING`,
      [user.rows[0].id, data.familyId],
    );
  await audit(tx, actor.id, "member.updated", { email, role }, data.familyId);
  return { saved: true };
}
export async function welcomeForToken(tx: Tx, value: string) {
  const base = process.env.BETTER_AUTH_URL;
  requireThat(base, "SETUP_REQUIRED", "Sign-in address is not configured.", 503);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("INVITE", "This invitation link is not valid.");
  }
  requireThat(
    url.origin === new URL(base).origin,
    "INVITE",
    "This invitation link is not valid.",
  );
  const token = url.searchParams.get("invite") ?? "";
  requireThat(
    token.length >= 20 && token.length <= 100,
    "INVITE",
    "This invitation link is not valid.",
  );
  const found = await tx.query(
    `SELECT i.email, i.role, i.display_name, i.family_id, f.name AS family_name, l.name AS learner_name
     FROM invitations i
     JOIN families f ON f.id = i.family_id
     LEFT JOIN learners l ON l.id = i.learner_id
     WHERE i.token_hash=$1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()`,
    [hash(token)],
  );
  const row = found.rows[0];
  requireThat(
    row && (row.role === "student" || row.role === "parent" || row.role === "teacher"),
    "INVITE",
    "This invitation is invalid, expired, or already used.",
  );
  const letter = welcomeLetter({
    name: row.display_name || row.learner_name || "",
    email: row.email,
    role: row.role,
    familyName: row.family_name,
    url: value,
  });
  return { ...letter, to: row.email as string, role: row.role as string, familyId: row.family_id as string };
}
export async function sendWelcome(actor: Actor, input: unknown) {
  await superuser(actor);
  const url = z.object({ url: z.string().min(20).max(500) }).parse(input).url;
  const letter = await transaction((tx) => welcomeForToken(tx, url));
  await deliverWelcome(letter);
  await transaction(async (tx) => {
    await audit(
      tx,
      actor.id,
      "welcome.sent",
      { email: letter.to, role: letter.role },
      letter.familyId,
    );
  }, letter.familyId);
  return { sent: true, email: letter.to };
}
export async function reissueInvite(actor: Actor, input: unknown) {
  await superuser(actor);
  const data = z
    .object({ familyId: z.string().uuid(), email: z.email() })
    .parse(input);
  const token = randomBytes(32).toString("base64url");
  const email = data.email.toLowerCase();
  await transaction(async (tx) => {
    const updated = await tx.query(
      `UPDATE invitations
       SET token_hash=$3, expires_at=now()+interval '7 days', revoked_at=NULL
       WHERE id = (
         SELECT id FROM invitations
         WHERE family_id=$1 AND lower(email)=$2 AND accepted_at IS NULL
         ORDER BY expires_at DESC
         LIMIT 1
       )
       RETURNING id, role`,
      [data.familyId, email, hash(token)],
    );
    requireThat(
      updated.rows.length,
      "NOT_FOUND",
      "This person does not have a pending invitation.",
      404,
    );
    await audit(
      tx,
      actor.id,
      "invitation.reissued",
      { email, role: updated.rows[0].role },
      data.familyId,
    );
  }, data.familyId);
  return { url: `${process.env.BETTER_AUTH_URL}/?invite=${token}` };
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
