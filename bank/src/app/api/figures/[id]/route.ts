import { NextResponse } from "next/server";
import { figureFile } from "@/server/papers";
import { operator, readTokenMatches } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const signedIn = await operator();
  const allowed = readTokenMatches(request.headers.get("authorization")) || signedIn;
  if (!allowed) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { id } = await context.params;
  const figure = await figureFile(id, !signedIn);
  if (!figure) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(figure.png), {
    headers: {
      "Content-Type": figure.media_type,
      "Cache-Control": "private, no-store",
    },
  });
}
