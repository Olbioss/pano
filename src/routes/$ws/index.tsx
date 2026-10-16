import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { workspaceQueryOptions } from "@/lib/workspaces";

export const Route = createFileRoute("/$ws/")({
  validateSearch: z.object({ board: z.string().optional().catch(undefined) }),
  component: WorkspaceHome,
});

function WorkspaceHome() {
  const { ws } = Route.useParams();
  const { board } = Route.useSearch();
  const { data: workspace } = useSuspenseQuery(workspaceQueryOptions(ws));
  const t = useTranslations("workspace");

  if (workspace.boards.length === 0) {
    return <p className="text-muted-foreground">{t("noBoards")}</p>;
  }
  const active =
    workspace.boards.find((b) => b.slug === board) ?? workspace.boards[0];

  return (
    <section className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-2" aria-label={t("boards")}>
        {workspace.boards.map((b) => (
          <Button
            key={b.id}
            asChild
            size="sm"
            variant={b.id === active?.id ? "secondary" : "ghost"}
          >
            <Link to="/$ws" params={{ ws }} search={{ board: b.slug }}>
              {b.name}
            </Link>
          </Button>
        ))}
      </nav>
      {/* Requests and the feed arrive in Phase 2. */}
      <p className="text-muted-foreground">
        {t("noRequestsYet", { board: active?.name ?? "" })}
      </p>
    </section>
  );
}
