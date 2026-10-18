import { useInfiniteQuery } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useFormatter, useNow, useTranslations } from "use-intl";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { AuthorName } from "@/features/posts/author-name";
import { repliesQueryOptions } from "@/lib/comments";
import { cn } from "@/lib/utils";
import type { CommentView } from "@/shared/comments";
import { isDraft } from "./comment-cache";
import { useThread } from "./thread-context";

/** One comment: who wrote it and when, its words, and its replies. */
export function CommentItem({ comment }: { comment: CommentView }) {
  const t = useTranslations("comments");
  const { post } = useThread();
  const [showReplies, setShowReplies] = useState(true);
  const draft = isDraft(comment);
  return (
    <li
      className={cn("flex flex-col gap-2", draft && "opacity-60")}
      aria-busy={draft || undefined}
    >
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        <CommentByline comment={comment} />
        {post.pinned?.id === comment.id && (
          <span className="font-medium text-foreground">{t("pinned")}</span>
        )}
        {comment.replyCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-expanded={showReplies}
            aria-label={showReplies ? t("hideReplies") : t("showReplies")}
            onClick={() => setShowReplies((shown) => !shown)}
          >
            {showReplies ? (
              <Minus aria-hidden="true" />
            ) : (
              <Plus aria-hidden="true" />
            )}
          </Button>
        )}
      </div>
      {comment.deleted ? (
        <p className="text-muted-foreground text-sm italic">{t("deleted")}</p>
      ) : (
        <Markdown>{comment.body}</Markdown>
      )}
      {showReplies && <Replies comment={comment} />}
    </li>
  );
}

/** Who wrote a comment, the Team badge, and when. A deleted one shows only when. */
export function CommentByline({ comment }: { comment: CommentView }) {
  const t = useTranslations("comments");
  const format = useFormatter();
  const now = useNow();
  return (
    <>
      {!comment.deleted && (
        <span className="font-medium text-foreground">
          <AuthorName author={comment.author} />
        </span>
      )}
      {comment.official && (
        <span className="rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground">
          {t("team")}
        </span>
      )}
      <time dateTime={comment.createdAt}>
        {format.relativeTime(new Date(comment.createdAt), now)}
      </time>
    </>
  );
}

/**
 * A comment's replies, oldest first. At first these are the latest ones
 * its page brought along. Asking for earlier ones switches to the reply
 * pages: newest page first, each page oldest first.
 */
function Replies({ comment }: { comment: CommentView }) {
  const t = useTranslations("comments");
  const [expanded, setExpanded] = useState(false);
  const pages = useInfiniteQuery({
    ...repliesQueryOptions(comment.postId, comment.id),
    enabled: expanded,
  });
  const data = expanded ? pages.data : undefined;
  const list = data
    ? [...data.pages].reverse().flatMap((page) => page.items)
    : comment.replies;
  const remaining = comment.replyCount - list.length;
  const hasEarlier = data ? pages.hasNextPage : remaining > 0;
  if (list.length === 0 && !hasEarlier) return null;
  return (
    <div className="flex flex-col gap-3 border-l pl-4">
      {hasEarlier && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto self-start p-0"
          disabled={pages.isFetching}
          onClick={() => {
            if (data) void pages.fetchNextPage();
            else setExpanded(true);
          }}
        >
          {remaining > 0
            ? t("earlierReplies", { count: remaining })
            : t("moreReplies")}
        </Button>
      )}
      {list.length > 0 && (
        <ol className="flex flex-col gap-3">
          {list.map((reply) => (
            <CommentItem key={reply.id} comment={reply} />
          ))}
        </ol>
      )}
    </div>
  );
}
