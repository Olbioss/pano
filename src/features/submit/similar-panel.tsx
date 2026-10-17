import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { StatusBadge } from "@/components/status-badge";
import { VoteButton } from "@/features/votes/vote-button";
import { similarQueryOptions } from "@/lib/posts";
import { useDebouncedValue } from "@/lib/use-debounced-value";

/**
 * Requests like the title being typed, each with a one-click vote. Links open
 * in a new tab so the draft stays put.
 */
export function SimilarPanel({
  workspace,
  title,
}: {
  workspace: string;
  title: string;
}) {
  const t = useTranslations("submit");
  const q = useDebouncedValue(title.trim(), 300);
  const similar = useQuery(similarQueryOptions(workspace, q));
  const items = similar.data ?? [];
  if (q.length < 3 || items.length === 0) return null;

  return (
    <aside
      className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3"
      aria-live="polite"
    >
      <div>
        <h3 className="font-medium text-sm">{t("similarHeading")}</h3>
        <p className="text-muted-foreground text-xs">{t("similarHint")}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((post) => (
          <li key={post.id} className="flex items-center gap-3">
            <VoteButton
              postId={post.id}
              title={post.title}
              voted={post.voted}
              voteCount={post.voteCount}
            />
            <a
              href={`/p/${post.ref}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate text-sm hover:underline"
            >
              {post.title}
            </a>
            <StatusBadge status={post.status} />
          </li>
        ))}
      </ul>
    </aside>
  );
}
