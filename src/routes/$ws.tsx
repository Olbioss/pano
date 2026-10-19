import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslations } from "use-intl";
import { useLocaleControls } from "@/i18n/provider";
import { ApiError } from "@/lib/api";
import { meQueryOptions } from "@/lib/session";
import { workspaceQueryOptions } from "@/lib/workspaces";

export const Route = createFileRoute("/$ws")({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        workspaceQueryOptions(params.ws)
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
  },
  component: WorkspaceLayout,
  notFoundComponent: WorkspaceNotFound,
});

function WorkspaceLayout() {
  const { ws } = Route.useParams();
  const { data: workspace } = useSuspenseQuery(workspaceQueryOptions(ws));
  const me = useQuery(meQueryOptions);
  const { setWorkspaceDefault } = useLocaleControls();
  const t = useTranslations("workspace");
  const onTeam = me.data?.workspaces.some((w) => w.slug === ws) ?? false;

  // Visitors who haven't picked a language see the workspace's default.
  useEffect(() => {
    setWorkspaceDefault(workspace.defaultLocale);
    return () => setWorkspaceDefault(null);
  }, [workspace.defaultLocale, setWorkspaceDefault]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-semibold text-2xl">{workspace.name}</h1>
        <nav className="flex gap-4 text-sm">
          <Link
            to="/$ws"
            params={{ ws }}
            activeOptions={{ exact: true, includeSearch: false }}
            activeProps={{ className: "font-semibold" }}
          >
            {t("requests")}
          </Link>
          <Link
            to="/$ws/roadmap"
            params={{ ws }}
            activeProps={{ className: "font-semibold" }}
          >
            {t("roadmap")}
          </Link>
          {onTeam && (
            <Link
              to="/$ws/settings"
              params={{ ws }}
              activeProps={{ className: "font-semibold" }}
            >
              {t("settings")}
            </Link>
          )}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

function WorkspaceNotFound() {
  const t = useTranslations("workspace");
  return (
    <p className="mx-auto max-w-3xl px-6 py-16 text-muted-foreground">
      {t("notFound")}
    </p>
  );
}
