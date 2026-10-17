// A production deployment cannot enable the test authentication path.
export function testLoginEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  if (
    env.VERCEL_ENV !== "preview" ||
    env.TEST_LOGIN_ENABLED !== "true" ||
    env.BETTER_AUTH_URL !== "https://gotfoth-persona-preview.vercel.app"
  )
    return false;
  try {
    return (
      new URL(env.DATABASE_URL ?? "").pathname === "/gotfoth_persona_preview"
    );
  } catch {
    return false;
  }
}
export function testRequestAllowed(
  request: Request | undefined,
  env: Record<string, string | undefined> = process.env,
) {
  return (
    testLoginEnabled(env) &&
    !!request &&
    new URL(request.url).origin === "https://gotfoth-persona-preview.vercel.app"
  );
}
