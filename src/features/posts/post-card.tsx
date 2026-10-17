import { Link } from "@tanstack/react-router";
import { useFormatter } from "use-intl";
import { StatusBadge } from "@/components/status-badge";
import { SignInToVote, VoteButton } from "@/features/votes/vote-button";
import type { PostSummary } from "@/shared/posts";
import { AuthorName } from "./author-name";

type Props = { post: PostSummary; signedIn: boolean; now: Date };

export function PostCard({ post, signedIn, now }: Props) {
  const format = useFormatter();
  return (
    <li className="flex gap-4 rounded-lg border p-4">
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
          className="font-medium hover:underline"
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
        </div>
      </div>
    </li>
  );
}
