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
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-lg">{t("workspaceSection")}</h2>
        <WorkspaceForm workspace={workspace} />
      </section>
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-lg">{t("boardsSection")}</h2>
          <p className="text-muted-foreground text-sm">{t("boardsHint")}</p>
        </div>
        <BoardsEditor slug={workspace.slug} boards={workspace.boards} />
      </section>
    </div>
  );
}
