"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { database } from "./db";
import { publishPaper } from "./papers";
import { operator, signIn, signOut } from "./session";

async function requireOperator() {
  if (!(await operator())) redirect("/login");
}

export async function login(formData: FormData) {
  const passphrase = String(formData.get("passphrase") ?? "");
  const ok = await signIn(passphrase);
  if (!ok) redirect("/login?error=1");
  redirect("/papers");
}

export async function logout() {
  await signOut();
  redirect("/login");
}

export async function reviewQuestion(formData: FormData) {
  await requireOperator();
  const revisionId = String(formData.get("revisionId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  const paperId = String(formData.get("paperId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 2000);
  if (decision !== "accept" && decision !== "reject") redirect(`/papers/${paperId}`);
  await database().query(
    "INSERT INTO reviews (id, question_revision_id, decision, note) VALUES (gen_random_uuid(), $1, $2, $3)",
    [revisionId, decision, note],
  );
  await refreshPaperStatus(paperId);
  revalidatePath(`/papers/${paperId}`);
  redirect(`/papers/${paperId}/questions/${questionId}`);
}

export async function confirmTopic(formData: FormData) {
  await requireOperator();
  const questionId = String(formData.get("questionId") ?? "");
  const topicId = String(formData.get("topicId") ?? "");
  const paperId = String(formData.get("paperId") ?? "");
  await database().query(
    `INSERT INTO question_topics (question_id, topic_id, confirmed) VALUES ($1, $2, true)
     ON CONFLICT (question_id, topic_id) DO UPDATE SET confirmed = true`,
    [questionId, topicId],
  );
  revalidatePath(`/papers/${paperId}/questions/${questionId}`);
}

export async function removeTopic(formData: FormData) {
  await requireOperator();
  const questionId = String(formData.get("questionId") ?? "");
  const topicId = String(formData.get("topicId") ?? "");
  const paperId = String(formData.get("paperId") ?? "");
  await database().query("DELETE FROM question_topics WHERE question_id = $1 AND topic_id = $2", [
    questionId,
    topicId,
  ]);
  revalidatePath(`/papers/${paperId}/questions/${questionId}`);
}

export async function confirmPermission(formData: FormData) {
  await requireOperator();
  const paperId = String(formData.get("paperId") ?? "");
  const confirmed = formData.get("permission") === "yes";
  await database().query("UPDATE papers SET permission_confirmed = $2 WHERE id = $1", [
    paperId,
    confirmed,
  ]);
  revalidatePath(`/papers/${paperId}`);
}

export async function publish(formData: FormData) {
  await requireOperator();
  const paperId = String(formData.get("paperId") ?? "");
  try {
    await publishPaper(paperId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publish failed.";
    redirect(`/papers/${paperId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/papers/${paperId}`);
  redirect(`/papers/${paperId}`);
}

async function refreshPaperStatus(paperId: string) {
  await database().query(
    `UPDATE papers p SET status = CASE
       WHEN p.status = 'published' THEN 'published'
       WHEN (
         SELECT count(*) FROM questions q
         JOIN question_revisions r ON r.question_id = q.id AND r.revision = 1
         WHERE q.paper_id = p.id
           AND (SELECT decision FROM reviews WHERE question_revision_id = r.id ORDER BY created_at DESC LIMIT 1) = 'accept'
       ) = (SELECT count(*) FROM questions WHERE paper_id = p.id)
       AND (SELECT count(*) FROM questions WHERE paper_id = p.id) > 0
       THEN 'reviewed'
       ELSE 'draft'
     END
     WHERE p.id = $1`,
    [paperId],
  );
}
