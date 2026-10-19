import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { database, family, transaction, type Actor, type Tx } from "./db";
import { requireThat, missing } from "../lib/errors";
import {
  comparisonKey,
  compareEvidence,
  type ComparableEvidence,
} from "../lib/comparison";

export function actorTransaction<T>(actor: Actor, fn: (tx: Tx) => Promise<T>) {
  return transaction(async (tx) => {
    await tx.query("SELECT set_config('app.user_id',$1,true)", [actor.id]);
    return fn(tx);
  });
}
export async function teachingFamilies(actor: Actor) {
  const rows = (
    await database().query(
      "SELECT f.id,f.name FROM memberships m JOIN families f ON f.id=m.family_id WHERE m.user_id=$1 AND m.active AND m.role='teacher' AND NOT f.suspended AND f.deleted_at IS NULL ORDER BY f.name,f.id",
      [actor.id],
    )
  ).rows;
  requireThat(rows.length, "FORBIDDEN", "Teacher access required.", 403);
  return rows;
}
export async function teacherGroups(actor: Actor) {
  await teachingFamilies(actor);
  return actorTransaction(actor, async (tx) => {
    const groups = (
      await tx.query<{ id: string; name: string }>(
        "SELECT id,name FROM teacher_groups WHERE owner_id=$1 ORDER BY lower(name),id",
        [actor.id],
      )
    ).rows;
    const members = (
      await tx.query<{
        group_id: string;
        family_id: string;
        learner_id: string;
      }>(
        `SELECT g.group_id,g.family_id,g.learner_id FROM teacher_group_members g JOIN memberships m ON m.family_id=g.family_id AND m.user_id=g.owner_id AND m.role='teacher' AND m.active JOIN families f ON f.id=g.family_id AND NOT f.suspended AND f.deleted_at IS NULL WHERE g.owner_id=$1`,
        [actor.id],
      )
    ).rows;
    return {
      groups: groups.map((g) => ({
        ...g,
        members: members.filter((m) => m.group_id === g.id),
      })),
    };
  });
}
export async function groupScope(actor: Actor, id: string) {
  z.string().uuid().parse(id);
  const result = (await teacherGroups(actor)).groups.find((g) => g.id === id);
  if (!result) throw missing();
  return result;
}
export async function saveGroup(actor: Actor, input: unknown) {
  await teachingFamilies(actor);
  const value = z
    .discriminatedUnion("action", [
      z.object({
        action: z.literal("save"),
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(100),
        members: z
          .array(
            z.object({
              familyId: z.string().uuid(),
              learnerId: z.string().uuid(),
            }),
          )
          .max(500),
      }),
      z.object({ action: z.literal("delete"), id: z.string().uuid() }),
    ])
    .parse(input);
  if (value.id) await groupScope(actor, value.id);
  if (value.action === "save") {
    for (const familyId of new Set(value.members.map((m) => m.familyId))) {
      const ids = [
        ...new Set(
          value.members
            .filter((m) => m.familyId === familyId)
            .map((m) => m.learnerId),
        ),
      ];
      await family(actor, familyId, async (tx, role) => {
        requireThat(
          role === "teacher",
          "FORBIDDEN",
          "Choose only your authorised students.",
          403,
        );
        requireThat(
          (
            await tx.query(
              "SELECT id FROM learners WHERE family_id=$1 AND id=ANY($2::uuid[])",
              [familyId, ids],
            )
          ).rows.length === ids.length,
          "FORBIDDEN",
          "Choose only your authorised students.",
          403,
        );
      });
    }
  }
  return actorTransaction(actor, async (tx) => {
    if (value.action === "delete") {
      await tx.query("DELETE FROM teacher_groups WHERE id=$1 AND owner_id=$2", [
        value.id,
        actor.id,
      ]);
      return { deleted: true };
    }
    const id = value.id ?? randomUUID();
    await tx.query(
      "INSERT INTO teacher_groups(id,owner_id,name) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name WHERE teacher_groups.owner_id=$2",
      [id, actor.id, value.name],
    );
    await tx.query(
      "DELETE FROM teacher_group_members WHERE group_id=$1 AND owner_id=$2",
      [id, actor.id],
    );
    const familyIds = [...new Set(value.members.map((m) => m.familyId))];
    const permitted = (
      await tx.query(
        "SELECT m.family_id FROM memberships m JOIN families f ON f.id=m.family_id WHERE m.user_id=$1 AND m.family_id=ANY($2::uuid[]) AND m.role='teacher' AND m.active AND NOT f.suspended AND f.deleted_at IS NULL FOR SHARE OF m,f",
        [actor.id, familyIds],
      )
    ).rows;
    requireThat(
      permitted.length === familyIds.length,
      "FORBIDDEN",
      "Teaching access changed. Refresh the group.",
      403,
    );
    await tx.query(
      "INSERT INTO teacher_group_members(group_id,owner_id,family_id,learner_id) SELECT $1::uuid,$2::text,(m->>'familyId')::uuid,(m->>'learnerId')::uuid FROM jsonb_array_elements($3::jsonb) m ON CONFLICT DO NOTHING",
      [id, actor.id, JSON.stringify(value.members)],
    );
    return { id };
  });
}
export async function groupComparison(actor: Actor, params: URLSearchParams) {
  const group = await groupScope(actor, params.get("group") ?? "");
  const from = z
    .string()
    .datetime()
    .parse(
      params.get("from") ?? new Date(Date.now() - 90 * 86400000).toISOString(),
    );
  const to = z
    .string()
    .datetime()
    .parse(params.get("to") ?? new Date().toISOString());
  requireThat(
    new Date(from).getTime() <= new Date(to).getTime(),
    "DATE",
    "Choose a valid date range.",
  );
  const evidence: ComparableEvidence[] = [];
  const activity: any[] = [];
  for (const f of await teachingFamilies(actor)) {
    const ids = group.members
      .filter((m) => m.family_id === f.id)
      .map((m) => m.learner_id);
    if (!ids.length) continue;
    await family(actor, f.id, async (tx, role) => {
      requireThat(
        role === "teacher",
        "FORBIDDEN",
        "Teacher access required.",
        403,
      );
      const people = (
        await tx.query(
          `SELECT l.id,l.name,(SELECT count(*)::int FROM submissions s WHERE s.learner_id=l.id AND s.submitted_at BETWEEN $2 AND $3) AS submissions,(SELECT count(*)::int FROM assessments r WHERE r.learner_id=l.id AND r.state='needs_review') AS pending FROM learners l WHERE l.id=ANY($1::uuid[])`,
          [ids, from, to],
        )
      ).rows;
      activity.push(
        ...people.map((p) => ({ ...p, familyId: f.id, familyName: f.name })),
      );
      const rows = (
        await tx.query(
          `SELECT r.id,r.learner_id,r.effective,s.submitted_at,a.mode,a.data FROM assessments r JOIN submissions s ON s.id=r.submission_id JOIN attempts a ON a.id=s.attempt_id WHERE r.learner_id=ANY($1::uuid[]) AND r.state='published' AND s.submitted_at BETWEEN $2 AND $3`,
          [ids, from, to],
        )
      ).rows;
      for (const row of rows) {
        const raw = comparisonKey(row.data, row.mode, row.effective);
        if (!raw) continue;
        const key = createHash("sha256").update(raw).digest("hex");
        evidence.push({
          learnerId: row.learner_id,
          familyId: f.id,
          name: people.find((p) => p.id === row.learner_id)?.name ?? "Student",
          id: row.id,
          at: new Date(row.submitted_at).toISOString(),
          key,
          label: `${row.data.subject} · ${row.data.paperTitle ?? row.data.title ?? "Matching questions"} · ${row.mode} · ${row.data.assisted ? "assisted" : "unassisted"} · ${(row.effective ?? []).some((r: any) => (row.data.seenQuestionIds ?? []).includes(r.questionId)) ? "includes seen questions" : "unseen"} · ${row.effective.length} questions`,
          awarded: row.effective.reduce(
            (s: number, r: any) => s + r.awarded,
            0,
          ),
          available: row.effective.reduce(
            (s: number, r: any) => s + r.available,
            0,
          ),
          topics: [
            ...new Set<string>(
              row.effective.flatMap(
                (r: any) =>
                  row.data.questions.find((q: any) => q.id === r.questionId)
                    ?.topics ?? [],
              ),
            ),
          ],
        });
      }
    });
  }
  const benchmarks = [...new Set(evidence.map((r) => r.key))]
    .map((key) => ({
      key,
      label: evidence.find((r) => r.key === key)!.label,
      count: compareEvidence(evidence, key).count,
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const key = params.get("benchmark") ?? benchmarks[0]?.key ?? "";
  const coverage = [...new Set(evidence.flatMap((r) => r.topics))]
    .sort()
    .map((topic) => ({
      topic,
      students: new Set(
        evidence
          .filter((r) => r.topics.includes(topic))
          .map((r) => r.learnerId),
      ).size,
      observations: new Set(
        evidence.filter((r) => r.topics.includes(topic)).map((r) => r.id),
      ).size,
    }));
  return {
    group: { id: group.id, name: group.name },
    from,
    to,
    activity,
    benchmarks,
    coverage,
    benchmark: key,
    ...compareEvidence(evidence, key),
  };
}
