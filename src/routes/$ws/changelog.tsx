import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ChangelogList } from "@/features/changelog/changelog-list";
import { changelogFeedUrl, changelogQueryOptions } from "@/lib/changelog";

export const Route = createFileRoute("/$ws/changelog")({
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: ({ context, params, deps }) => {
    // Starts loading with the route instead of after it renders.
    void context.queryClient.prefetchQuery(
      changelogQueryOptions(params.ws, deps.page)
    );
  },
  component: ChangelogPage,
});

function ChangelogPage() {
  const { ws } = Route.useParams();
  const page = Route.useSearch().page ?? 1;
  const navigate = useNavigate({ from: Route.fullPath });
  const t = useTranslations("changelog");
  const changelog = useQuery(changelogQueryOptions(ws, page));
  const goToPage = (next: number) =>
    void navigate({ search: { page: next > 1 ? next : undefined } });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-muted-foreground text-sm">{t("intro")}</p>
        <a
          href={changelogFeedUrl(ws)}
          className="text-sm underline underline-offset-4"
        >
          {t("follow")}
        </a>
      </div>
      {changelog.isPending ? (
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      ) : changelog.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {t("loadFailed")}
        </p>
      ) : (
        <ChangelogList entries={changelog.data.entries} />
      )}
      {(page > 1 || changelog.data?.hasMore) && (
        <nav
          className="flex items-center justify-between"
          aria-label={t("pages")}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            {t("newer")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!changelog.data?.hasMore}
            onClick={() => goToPage(page + 1)}
          >
            {t("older")}
          </Button>
        </nav>
      )}
    </section>
  );
}
