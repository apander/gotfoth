import { actor } from "@/server/auth";
import { AppError } from "@/lib/errors";
import { examFigure } from "@/server/exam-papers";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const figure = await examFigure(await actor(), id);
    return new Response(new Uint8Array(figure.png), {
      headers: {
        "Content-Type": figure.media_type || "image/png",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const known = error instanceof AppError;
    return new Response(known ? error.message : "This figure is unavailable.", {
      status: known ? error.status : 500,
    });
  }
}
