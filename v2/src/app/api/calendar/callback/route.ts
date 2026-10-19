import { actor } from "@/server/auth";
import { calendarCallback } from "@/server/integrations";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await calendarCallback(
      await actor(),
      url.searchParams.get("code") ?? "",
      url.searchParams.get("state") ?? "",
    );
    return Response.redirect(
      new URL(
        `/?page=Plan&calendar=connected${result.familyId ? `&context=${result.familyId}&family=${result.familyId}` : ""}`,
        request.url,
      ),
    );
  } catch {
    return Response.redirect(
      new URL("/?page=Plan&calendar=reconnect", request.url),
    );
  }
}
