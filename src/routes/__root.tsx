import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { SiteHeader } from "@/components/site-header";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: () => (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <div className="flex-1">
        <Outlet />
      </div>
      <Toaster position="bottom-center" richColors />
    </div>
  ),
});
