import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { safeRedirect } from "@/lib/redirect";
import { meQueryOptions } from "@/lib/session";

/**
 * Where a person goes once signed in, however they signed in: the page that
 * sent them to sign in, else their workspace, else making one. Stable across
 * renders, so effects can depend on it.
 */
export function useAfterSignIn() {
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useCallback(
    async (redirectTo?: string) => {
      const me = await queryClient.fetchQuery({
        ...meQueryOptions,
        staleTime: 0,
      });
      const redirect = safeRedirect(redirectTo);
      const workspace = me.workspaces[0];
      if (redirect) router.history.push(redirect);
      else if (workspace) {
        await navigate({ to: "/$ws", params: { ws: workspace.slug } });
      } else await navigate({ to: "/new-workspace" });
    },
    [router, navigate, queryClient]
  );
}
