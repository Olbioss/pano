import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useNow, useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { FeedToolbar } from "@/features/feed/feed-toolbar";
import {
  type FeedSearch,
  feedParams,
  feedSearchSchema,
} from "@/features/feed/search";
import { PostCard } from "@/features/posts/post-card";
import { feedQueryOptions } from "@/lib/posts";
import { meQueryOptions } from "@/lib/session";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { workspaceQueryOptions } from "@/lib/workspaces";

export const Route = createFileRoute("/$ws/")({
  validateSearch: feedSearchSchema,
  component: Feed,
});

function Feed() {
  const { ws } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: workspace } = useSuspenseQuery(workspaceQueryOptions(ws));
  const me = useQuery(meQueryOptions);
  const t = useTranslations("feed");
  const tWorkspace = useTranslations("workspace");
  const now = useNow({ updateInterval: 60_000 });
  const params = feedParams(search);
  // The URL follows every keystroke; the request waits for a pause in typing.
  const q = useDebouncedValue(params.q, 300);
  const feed = useQuery(feedQueryOptions(ws, { ...params, q }));
  const signedIn = Boolean(me.data?.user);

  // A filter change goes back to the first page. Typing replaces the history
  // entry instead of adding one per letter.
  const update = (
    next: Partial<FeedSearch>,
    options: { replace?: boolean } = {}
  ) =>
    navigate({
      search: (prev) => ({ ...prev, ...next, page: undefined }),
      replace: options.replace,
    });
  const goToPage = (page: number) =>
    navigate({
      search: (prev) => ({ ...prev, page: page > 1 ? page : undefined }),
    });

  if (workspace.boards.length === 0) {
    return <p className="text-muted-foreground">{tWorkspace("noBoards")}</p>;
  }

  const items = feed.data?.items ?? [];
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FeedToolbar
          boards={workspace.boards}
          params={params}
          rawQuery={search.q ?? ""}
          onChange={update}
        />
        <Button asChild size="sm">
          <Link to="/$ws/new" params={{ ws }} search={{ board: params.board }}>
            {t("newRequest")}
          </Link>
        </Button>
      </div>
      {feed.isPending ? (
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      ) : feed.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {t("loadFailed")}
        </p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">
          {params.q ? t("emptySearch") : t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((post) => (
            <PostCard key={post.id} post={post} signedIn={signedIn} now={now} />
          ))}
        </ul>
      )}
      {(params.page > 1 || feed.data?.hasMore) && (
        <nav
          className="flex items-center justify-between"
          aria-label={t("pages")}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={params.page <= 1}
            onClick={() => goToPage(params.page - 1)}
          >
            {t("previous")}
          </Button>
          <span className="text-muted-foreground text-sm">
            {t("page", { page: params.page })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!feed.data?.hasMore}
            onClick={() => goToPage(params.page + 1)}
          >
            {t("next")}
          </Button>
        </nav>
      )}
    </section>
  );
}
