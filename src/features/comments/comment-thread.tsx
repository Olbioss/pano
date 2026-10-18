import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { threadQueryOptions } from "@/lib/comments";
import { meQueryOptions } from "@/lib/session";
import type { CommentView } from "@/shared/comments";
import type { PostDetail } from "@/shared/posts";
import { CommentComposer, SignInToComment } from "./comment-composer";
import { CommentByline, CommentItem } from "./comment-item";
import { ThreadContext, useThread } from "./thread-context";
import { usePinComment } from "./use-comment-actions";

/**
 * A post's comments: the pinned one, the comment box, then the thread,
 * newest first.
 */
export function CommentThread({ post }: { post: PostDetail }) {
  const t = useTranslations("comments");
  const me = useQuery(meQueryOptions);
  const thread = useInfiniteQuery(threadQueryOptions(post.id));
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const viewerName = me.data?.user ? me.data.user.name : null;
  const state = useMemo(
    () => ({ post, viewerName, replyingTo, setReplyingTo }),
    [post, viewerName, replyingTo]
  );
  const items = thread.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <ThreadContext value={state}>
      <section
        aria-labelledby="comments-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="comments-heading" className="font-semibold text-lg">
          {t("heading", { count: post.commentCount })}
        </h2>
        {post.pinned && <PinnedComment comment={post.pinned} />}
        {viewerName !== null ? (
          <CommentComposer parent={null} />
        ) : me.isPending ? null : (
          <SignInToComment />
        )}
        {thread.isPending ? (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        ) : thread.isError && !thread.data ? (
          <p className="text-destructive text-sm" role="alert">
            {t("loadFailed")}
          </p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ol aria-label={t("listLabel")} className="flex flex-col gap-5">
            {items.map((comment) => (
              <CommentItem key={comment.id} comment={comment} />
            ))}
          </ol>
        )}
        {thread.hasNextPage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={thread.isFetchingNextPage}
            onClick={() => void thread.fetchNextPage()}
          >
            {t("olderComments")}
          </Button>
        )}
      </section>
    </ThreadContext>
  );
}

/** The team's pinned comment, above the thread. The team can unpin it here. */
function PinnedComment({ comment }: { comment: CommentView }) {
  const t = useTranslations("comments");
  const { post } = useThread();
  const pin = usePinComment(post.id);
  return (
    <section
      aria-label={t("pinnedByTeam")}
      className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-4"
    >
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        <span className="font-medium text-foreground">{t("pinnedByTeam")}</span>
        <CommentByline comment={comment} />
      </div>
      <Markdown>{comment.body}</Markdown>
      {post.isTeam && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="self-start"
          onClick={() => pin.mutate(null)}
        >
          {t("unpin")}
        </Button>
      )}
    </section>
  );
}
