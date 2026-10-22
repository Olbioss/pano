import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  DEMO_EMAIL_DOMAIN,
  DEMO_ROLES,
  DEMO_WORKSPACE_SLUG,
} from "@/shared/demo";
import type { Database } from "../db/client";
import { member, organization, workspaceSettings } from "../db/schema";
import { localeFromHeaders } from "../lib/request-locale";

const GUEST = { en: "Guest", tr: "Misafir" } as const;

/**
 * "Try as team" and "Try as member": POST /api/auth/demo/sign-in {as}.
 *
 * Every visit gets its own guest account, so each visitor's votes are their
 * own and their limits aren't shared with everyone else trying the demo.
 * A team guest joins the demo workspace's team. Guests have demo addresses,
 * which receive no email, and the nightly reset deletes them all.
 *
 * Better Auth sets the session cookie, the same way its own sign-ins do, and
 * its per-address rate limit applies (see worker/auth.ts).
 */
export function demoSignIn({ db }: { db: Database }) {
  return {
    id: "demo-sign-in",
    endpoints: {
      signInDemo: createAuthEndpoint(
        "/demo/sign-in",
        { method: "POST", body: z.object({ as: z.enum(DEMO_ROLES) }) },
        async (ctx) => {
          const [demo] = await db
            .select({ id: organization.id })
            .from(organization)
            .innerJoin(
              workspaceSettings,
              eq(workspaceSettings.organizationId, organization.id)
            )
            .where(
              and(
                eq(organization.slug, DEMO_WORKSPACE_SLUG),
                eq(workspaceSettings.isDemo, true)
              )
            )
            .limit(1);
          if (!demo) {
            throw new APIError("NOT_FOUND", {
              message: "The demo workspace isn't set up",
            });
          }
          const locale = localeFromHeaders(new Headers(ctx.headers));
          const number = 1000 + Math.floor(Math.random() * 9000);
          const user = await ctx.context.internalAdapter.createUser(
            {
              email: `guest-${crypto.randomUUID()}@${DEMO_EMAIL_DOMAIN}`,
              name: `${GUEST[locale]} ${number}`,
              emailVerified: true,
            },
            { method: "demo" }
          );
          const team = ctx.body.as === "team";
          if (team) {
            await db.insert(member).values({
              id: crypto.randomUUID(),
              organizationId: demo.id,
              userId: user.id,
              role: "member",
              createdAt: new Date(),
            });
          }
          const session = await ctx.context.internalAdapter.createSession(
            user.id
          );
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ name: user.name, team });
        }
      ),
    },
  } satisfies BetterAuthPlugin;
}
