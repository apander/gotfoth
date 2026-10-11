import { actor } from "@/server/auth";
import { AppError } from "@/lib/errors";
import { examPaperFile } from "@/server/exam-papers";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const file = await examPaperFile(await actor(), id);
    return new Response(new Uint8Array(file.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const known = error instanceof AppError;
    return new Response(known ? error.message : "The original paper is unavailable.", {
      status: known ? error.status : 500,
    });
  }
}
