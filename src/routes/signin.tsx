import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { SignInPage } from "@/features/auth/sign-in-page";
import { safeRedirect } from "@/lib/redirect";
import { meQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/signin")({
  validateSearch: z.object({
    redirect: z.string().optional().catch(undefined),
    // Set by GitHub sign-in when it came back refused.
    error: z.string().optional().catch(undefined),
  }),
  // Someone already signed in moves on, which is also how GitHub sign-in
  // ends: GitHub sends the browser back here.
  beforeLoad: async ({ context, search }) => {
    const me = await context.queryClient
      .ensureQueryData(meQueryOptions)
      .catch(() => null);
    if (!me?.user) return;
    const target = safeRedirect(search.redirect);
    if (target) throw redirect({ href: target });
    const workspace = me.workspaces[0];
    if (workspace) {
      throw redirect({ to: "/$ws", params: { ws: workspace.slug } });
    }
    throw redirect({ to: "/new-workspace" });
  },
  component: SignIn,
});

function SignIn() {
  const { redirect, error } = Route.useSearch();
  return <SignInPage redirect={redirect} error={error} />;
}
