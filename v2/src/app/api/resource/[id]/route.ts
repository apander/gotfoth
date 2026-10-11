import { get } from "@vercel/blob";
import { actor } from "@/server/auth";
import { family, learnerAccess } from "@/server/db";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await actor(),
      url = new URL(request.url),
      id = (await context.params).id;
    const path = await family(
      user,
      url.searchParams.get("family") ?? "",
      async (tx) => {
        const a = (
          await tx.query("SELECT * FROM attempts WHERE id=$1", [
            url.searchParams.get("attempt"),
          ])
        ).rows[0];
        if (!a) throw new Error("Unavailable");
        await learnerAccess(tx, user, a.family_id, a.learner_id);
        if (!a.data.resources.some((r: any) => r.fileId === id))
          throw new Error("Unavailable");
        const source = (
          await tx.query(
            "SELECT * FROM source_documents WHERE id=$1 AND metadata->>'type'='paper'",
            [id],
          )
        ).rows[0];
        if (!source) throw new Error("Unavailable");
        const papers = (
          await tx.query(
            "SELECT data FROM catalogue WHERE status='published' AND data->'sourceIds' ? $1",
            [id],
          )
        ).rows;
        for (const paper of papers)
          for (const q of paper.data.questions)
            await tx.query(
              "INSERT INTO exposure(family_id,learner_id,question_id,reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
              [a.family_id, a.learner_id, q.id, "original_paper_resource"],
            );
        return source.blob_path;
      },
    );
    const blob = await get(path, { access: "private", useCache: false });
    if (!blob || blob.statusCode !== 200)
      return new Response(null, { status: 404 });
    return new Response(blob.stream, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
