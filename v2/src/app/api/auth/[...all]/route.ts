import { auth } from "@/server/auth";
import { toNextJsHandler } from "better-auth/next-js";
export async function GET(request: Request) {
  try {
    return await toNextJsHandler(auth()).GET(request);
  } catch {
    return Response.json(
      {
        error: {
          code: "SETUP_REQUIRED",
          message: "Google sign-in is not configured.",
        },
      },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  try {
    return await toNextJsHandler(auth()).POST(request);
  } catch {
    return Response.json(
      {
        error: {
          code: "SETUP_REQUIRED",
          message: "Google sign-in is not configured.",
        },
      },
      { status: 503 },
    );
  }
}
