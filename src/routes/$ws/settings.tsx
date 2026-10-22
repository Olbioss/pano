import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { BoardsEditor } from "@/components/settings/boards-editor";
import { WorkspaceForm } from "@/components/settings/workspace-form";
import { meQueryOptions } from "@/lib/session";
import { workspaceQueryOptions } from "@/lib/workspaces";

export const Route = createFileRoute("/$ws/settings")({
  beforeLoad: async ({ context, params, location }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.user) {
      throw redirect({ to: "/signin", search: { redirect: location.href } });
    }
    // Only the team sees settings; the API refuses everyone else anyway.
    if (!me.workspaces.some((w) => w.slug === params.ws)) {
      throw redirect({ to: "/$ws", params: { ws: params.ws } });
    }
  },
  component: Settings,
});

function Settings() {
  const { ws } = Route.useParams();
  const { data: workspace } = useSuspenseQuery(workspaceQueryOptions(ws));
  const t = useTranslations("settings");
  const tDemo = useTranslations("demo");
  return (
    // The demo's settings stay as the nightly reset makes them; the API
    // refuses changes, and a disabled fieldset says so up front.
    <fieldset disabled={workspace.isDemo} className="flex flex-col gap-10">
      {workspace.isDemo && (
        <p className="paper p-4 text-sm">{tDemo("settingsReadOnly")}</p>
      )}
      <section className="paper flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="font-semibold text-lg">{t("workspaceSection")}</h2>
        <WorkspaceForm workspace={workspace} />
      </section>
      <section className="paper flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-lg">{t("boardsSection")}</h2>
          <p className="text-muted-foreground text-sm">{t("boardsHint")}</p>
        </div>
        <BoardsEditor slug={workspace.slug} boards={workspace.boards} />
      </section>
    </fieldset>
  );
}
