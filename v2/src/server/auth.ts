import "server-only";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { accountIsSuperuser, database, type Actor } from "./db";
import { AppError } from "../lib/errors";
let instance: ReturnType<typeof betterAuth> | undefined;
export function auth() {
  if (instance) return instance;
  if (
    !process.env.BETTER_AUTH_SECRET ||
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET
  )
    throw new AppError(
      "SETUP_REQUIRED",
      "Google sign-in has not been configured.",
      503,
    );
  const options: BetterAuthOptions = {
    database: database(),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
    },
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!user.emailVerified)
              throw new APIError("FORBIDDEN", {
                message: "A verified Google email is required.",
              });
            if (
              await accountIsSuperuser({
                id: user.id,
                email: user.email,
                emailVerified: Boolean(user.emailVerified),
              })
            )
              return { data: user };
            const pending = await database().query(
              "SELECT id FROM invitations WHERE lower(email)=lower($1) AND expires_at>now() AND revoked_at IS NULL AND accepted_at IS NULL",
              [user.email],
            );
            if (!pending.rows.length)
              throw new APIError("FORBIDDEN", {
                message: "Study Vault is invitation only.",
              });
            return { data: user };
          },
        },
      },
    },
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  };
  instance = betterAuth(options);
  return instance;
}
export async function actor(): Promise<Actor> {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user.emailVerified)
    throw new AppError("UNAUTHENTICATED", "Please sign in with Google.", 401);
  return {
    id: session.user.id,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
  };
}
