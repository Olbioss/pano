import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { useFormatter, useTranslations } from "use-intl";
import { StatusBadge } from "@/components/status-badge";
import { SignInToVote, VoteButton } from "@/features/votes/vote-button";
import type { PostSummary } from "@/shared/posts";
import { AuthorName } from "./author-name";

type Props = { post: PostSummary; signedIn: boolean; now: Date };

export function PostCard({ post, signedIn, now }: Props) {
  const format = useFormatter();
  const tComments = useTranslations("comments");
  return (
    <li className="paper flex items-start gap-4 p-4">
      {signedIn ? (
        <VoteButton
          postId={post.id}
          title={post.title}
          voted={post.voted}
          voteCount={post.voteCount}
        />
      ) : (
        <SignInToVote voteCount={post.voteCount} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          to="/p/$ref"
          params={{ ref: post.ref }}
          className="font-heading font-semibold text-[1.0625rem] leading-snug hover:underline"
        >
          {post.title}
        </Link>
        {post.excerpt && (
          <p className="line-clamp-2 text-muted-foreground text-sm">
            {post.excerpt}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
          <StatusBadge status={post.status} />
          <span>{post.board.name}</span>
          <span aria-hidden="true">·</span>
          <AuthorName author={post.author} />
          <span aria-hidden="true">·</span>
          <time dateTime={post.createdAt}>
            {format.relativeTime(new Date(post.createdAt), now)}
          </time>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare aria-hidden="true" className="size-3.5" />
            <span aria-hidden="true">{post.commentCount}</span>
            <span className="sr-only">
              {tComments("count", { count: post.commentCount })}
            </span>
          </span>
        </div>
      </div>
    </li>
  );
}
