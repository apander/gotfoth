import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { testAccounts, isTestFamily } from "../lib/test-accounts";
import { accountIsSuperuser, database } from "./db";

export function testSignInAccount(user: {
  id: string;
  email: string;
  emailVerified: boolean;
}) {
  return user.emailVerified
    ? testAccounts.find(
        (account) =>
          account.id === user.id && account.email === user.email.toLowerCase(),
      )
    : undefined;
}

export const testSignIn = () =>
  ({
    id: "test-sign-in",
    endpoints: {
      signInTest: createAuthEndpoint(
        "/sign-in/test",
        { method: "POST", body: z.object({ email: z.string().email() }) },
        async (ctx) => {
          const request = ctx.request;
          if (
            !request ||
            request.headers.get("origin") !== new URL(request.url).origin
          )
            throw new APIError("FORBIDDEN", {
              message: "Request origin could not be verified.",
            });
          const account = testAccounts.find(
            (candidate) => candidate.email === ctx.body.email.toLowerCase(),
          );
          if (!account)
            throw new APIError("FORBIDDEN", {
              message: "Choose one of the listed test accounts.",
            });
          const user = await ctx.context.internalAdapter.findUserById(
            account.id,
          );
          if (!user || !testSignInAccount(user))
            throw new APIError("SERVICE_UNAVAILABLE", {
              message: "This test account has not been set up yet.",
            });
          const memberships = (
            await database().query(
              "SELECT m.family_id,m.role,f.name,f.suspended,f.deleted_at FROM memberships m JOIN families f ON f.id=m.family_id WHERE m.user_id=$1 AND m.active",
              [user.id],
            )
          ).rows;
          if (
            (await accountIsSuperuser({ ...user, emailVerified: true })) ||
            !memberships.length ||
            memberships.some(
              (member) =>
                !isTestFamily(member.family_id) ||
                !member.name.startsWith("[Test] ") ||
                member.suspended ||
                member.deleted_at ||
                !(
                  account.role === "mixed"
                    ? ["parent", "teacher"]
                    : [account.role]
                ).includes(member.role),
            )
          )
            throw new APIError("FORBIDDEN", {
              message: "This account is not configured for a test workspace.",
            });
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          if (!session)
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "The test session could not be started.",
            });
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ success: true });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
