import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  notFound,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useFormatter, useNow, useTranslations } from "use-intl";
import { Markdown } from "@/components/markdown";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { CommentThread } from "@/features/comments/comment-thread";
import { MergePanel } from "@/features/merge/merge-panel";
import { AuthorName } from "@/features/posts/author-name";
import { PostEditor } from "@/features/posts/post-editor";
import { StatusControl } from "@/features/status/status-control";
import { StatusTimeline } from "@/features/status/status-timeline";
import { SubscribeButton } from "@/features/subscriptions/subscribe-button";
import { SignInToVote, VoteButton } from "@/features/votes/vote-button";
import { useLocaleControls } from "@/i18n/provider";
import { ApiError } from "@/lib/api";
import { threadQueryOptions } from "@/lib/comments";
import { apiErrorKey } from "@/lib/error-text";
import { postKeys } from "@/lib/keys";
import { deletePost, postQueryOptions } from "@/lib/posts";
import { meQueryOptions } from "@/lib/session";
import type { PostDetail } from "@/shared/posts";
import { parseRef } from "@/shared/ref";

export const Route = createFileRoute("/p/$ref")({
  loader: async ({ context, params }) => {
    const id = parseRef(params.ref);
    if (id === null) throw notFound();
    let post: PostDetail;
    try {
      post = await context.queryClient.ensureQueryData(postQueryOptions(id));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
    // A merged post's page is the one it was merged into.
    if (post.mergedInto) {
      throw redirect({
        to: "/p/$ref",
        params: { ref: post.mergedInto.ref },
        replace: true,
      });
    }
    // An old or mistyped slug: show the post at its current address.
    if (post.ref !== params.ref) {
      throw redirect({
        to: "/p/$ref",
        params: { ref: post.ref },
        replace: true,
      });
    }
    // Comments start loading with the post instead of after it renders.
    void context.queryClient.prefetchInfiniteQuery(threadQueryOptions(id));
  },
  // A new page for each post: going from one to another (a merge lands on
  // the original) must not carry over an open editor, panel or note. A
  // corrected slug keeps the same post, and the same page.
  remountDeps: ({ params }) => parseRef(params.ref),
  component: PostPage,
  notFoundComponent: PostNotFound,
});

function PostPage() {
  const { ref } = Route.useParams();
  // The loader turned away any ref without an id.
  const id = parseRef(ref) ?? 0;
  const { data: post } = useSuspenseQuery(postQueryOptions(id));
  const me = useQuery(meQueryOptions);
  const { setWorkspaceDefault } = useLocaleControls();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();
  const signedIn = Boolean(me.data?.user);

  // As on the workspace's own pages: visitors who haven't picked a language
  // see the workspace's default.
  useEffect(() => {
    setWorkspaceDefault(post.workspace.defaultLocale);
    return () => setWorkspaceDefault(null);
  }, [post.workspace.defaultLocale, setWorkspaceDefault]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <Link
        to="/$ws"
        params={{ ws: post.workspace.slug }}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {post.workspace.name}
      </Link>
      <article className="paper flex items-start gap-4 p-5 sm:p-6">
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
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {editing ? (
            <PostEditor post={post} onDone={() => setEditing(false)} />
          ) : (
            <>
              <h1 className="font-bold text-3xl leading-tight">{post.title}</h1>
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                <StatusBadge status={post.status} />
                <span>{post.board.name}</span>
                <span aria-hidden="true">·</span>
                <AuthorName author={post.author} />
                <span aria-hidden="true">·</span>
                <time dateTime={post.createdAt}>
                  {format.relativeTime(new Date(post.createdAt), now)}
                </time>
              </div>
              {post.body && <Markdown>{post.body}</Markdown>}
              {post.canEdit && (
                <PostActions post={post} onEdit={() => setEditing(true)} />
              )}
            </>
          )}
        </div>
      </article>
      {(signedIn || post.isTeam) && (
        <div className="paper flex flex-col gap-4 p-5 sm:p-6">
          {signedIn && <SubscribeButton post={post} />}
          {post.isTeam && <StatusControl post={post} />}
          {post.isTeam && (
            <MergePanel
              post={post}
              onMerged={(target) =>
                navigate({ to: "/p/$ref", params: { ref: target.ref } })
              }
            />
          )}
        </div>
      )}
      <StatusTimeline timeline={post.timeline} />
      <CommentThread post={post} />
    </main>
  );
}

function PostActions({
  post,
  onEdit,
}: {
  post: PostDetail;
  onEdit: () => void;
}) {
  const t = useTranslations("post");
  const tErrors = useTranslations("errors");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => deletePost(post.id),
    onSuccess: async () => {
      // Leave first: dropping the cached post under this page would refetch it.
      await navigate({ to: "/$ws", params: { ws: post.workspace.slug } });
      qc.removeQueries({ queryKey: postKeys.detail(post.id) });
      await qc.invalidateQueries({
        queryKey: postKeys.feeds(post.workspace.slug),
      });
    },
    onError: (error) => {
      toast.error(tErrors(apiErrorKey(error)));
    },
  });

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={onEdit}>
        {t("edit")}
      </Button>
      {confirming ? (
        <Button
          size="sm"
          variant="destructive"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          {t("confirmDelete")}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
          {t("delete")}
        </Button>
      )}
    </div>
  );
}

function PostNotFound() {
  const t = useTranslations("post");
  return (
    <p className="mx-auto max-w-3xl px-6 py-16 text-muted-foreground">
      {t("notFound")}
    </p>
  );
}
