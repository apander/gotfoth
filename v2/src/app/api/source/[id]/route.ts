import { get } from "@vercel/blob";
import { actor } from "@/server/auth";
import { superuser, database } from "@/server/db";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    superuser(await actor());
    const id = (await context.params).id;
    const row = (
      await database().query(
        "SELECT blob_path FROM source_documents WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (!row) return new Response(null, { status: 404 });
    const blob = await get(row.blob_path, {
      access: "private",
      useCache: false,
    });
    if (!blob || blob.statusCode !== 200)
      return new Response(null, { status: 404 });
    return new Response(blob.stream, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
