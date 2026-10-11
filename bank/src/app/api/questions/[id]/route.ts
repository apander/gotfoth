import { NextResponse } from "next/server";
import { publishedQuestion } from "@/server/papers";
import { operator, readTokenMatches } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const allowed = readTokenMatches(request.headers.get("authorization")) || (await operator());
  if (!allowed) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { id } = await context.params;
  const question = await publishedQuestion(id);
  if (!question) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(question, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
