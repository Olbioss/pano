import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { AccountPage } from "@/features/account/account-page";
import { meQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/account")({
  validateSearch: z.object({
    // Set when connecting GitHub came back refused.
    error: z.string().optional().catch(undefined),
  }),
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.user) {
      throw redirect({ to: "/signin", search: { redirect: location.href } });
    }
  },
  component: Account,
});

function Account() {
  const { error } = Route.useSearch();
  return <AccountPage error={error} />;
}
