import { type InfiniteData, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { commentKeys, type FeedParams, postKeys } from "@/lib/keys";
import type { CommentPage, CommentView } from "@/shared/comments";
import type { FeedPage, PostDetail, PostSummary } from "@/shared/posts";
import {
  draftComment,
  optimisticAddComment,
  optimisticDeleteComment,
  optimisticPin,
  replaceDraft,
  writeCommentCount,
} from "./comment-cache";

type Pages = InfiniteData<CommentPage>;

const comment = (
  id: number,
  overrides: Partial<CommentView> = {}
): CommentView => ({
  id,
  postId: 7,
  parentId: null,
  depth: 0,
  body: `Comment ${id}`,
  author: { name: "Ayşe" },
  official: false,
  deleted: false,
  replyCount: 0,
  replies: [],
  canDelete: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

const summary: PostSummary = {
  id: 7,
  ref: "7-dark-mode",
  title: "Dark mode",
  excerpt: "",
  status: "open",
  voteCount: 3,
  commentCount: 3,
  voted: false,
  board: { slug: "features", name: "Features" },
  author: { name: "Ayşe" },
  createdAt: "2026-10-01T00:00:00.000Z",
};
const detail: PostDetail = {
  ...summary,
  body: "",
  workspace: { slug: "acme", name: "Acme", defaultLocale: "en" },
  canEdit: false,
  isTeam: false,
  pinned: null,
  subscribed: false,
  timeline: [],
};
const feedParams: FeedParams = { sort: "trending", page: 1 };
const feedKey = postKeys.feed("acme", feedParams);

/** Two comments, the first with one reply, cached with the post and a feed. */
function seed() {
  const qc = new QueryClient();
  const reply = comment(11, { parentId: 10, depth: 1 });
  qc.setQueryData<Pages>(commentKeys.thread(7), {
    pages: [
      {
        items: [comment(10, { replyCount: 1, replies: [reply] }), comment(9)],
        hasMore: false,
      },
    ],
    pageParams: [null],
  });
  qc.setQueryData(postKeys.detail(7), detail);
  qc.setQueryData<FeedPage>(feedKey, {
    items: [summary],
    page: 1,
    hasMore: false,
  });
  return qc;
}

const threadOf = (qc: QueryClient) =>
  qc.getQueryData<Pages>(commentKeys.thread(7))?.pages[0]?.items ?? [];
const counts = (qc: QueryClient) => ({
  detail: qc.getQueryData<PostDetail>(postKeys.detail(7))?.commentCount,
  feed: qc.getQueryData<FeedPage>(feedKey)?.items[0]?.commentCount,
});
const draft = (parent: CommentView | null, body = "New") =>
  draftComment({
    postId: 7,
    parent,
    body,
    authorName: "Bora",
    official: false,
  });

describe("comment cache", () => {
  it("drafts a comment with a temporary negative id", () => {
    const first = draft(null, "  New  ");
    const second = draft(null);
    expect(first).toMatchObject({
      postId: 7,
      parentId: null,
      depth: 0,
      body: "New",
      author: { name: "Bora" },
    });
    expect(first.id).toBeLessThan(0);
    expect(second.id).not.toBe(first.id);
  });

  it("drafts a reply to the deepest comment beside it", () => {
    const deepest = comment(20, { parentId: 19, depth: 3 });
    expect(draft(deepest)).toMatchObject({ parentId: 19, depth: 3 });
  });

  it("puts a new comment atop the thread, counted wherever the post shows", async () => {
    const qc = seed();
    const added = draft(null);
    await optimisticAddComment(qc, added);
    expect(threadOf(qc).map((c) => c.id)).toEqual([added.id, 10, 9]);
    expect(counts(qc)).toEqual({ detail: 4, feed: 4 });
  });

  it("adds a reply last among its parent's replies, open reply pages included", async () => {
    const qc = seed();
    qc.setQueryData<Pages>(commentKeys.replies(7, 10), {
      pages: [
        { items: [comment(11, { parentId: 10, depth: 1 })], hasMore: false },
      ],
      pageParams: [null],
    });
    const reply = draft(threadOf(qc)[0]!);
    await optimisticAddComment(qc, reply);
    expect(threadOf(qc)[0]?.replyCount).toBe(2);
    expect(threadOf(qc)[0]?.replies.map((c) => c.id)).toEqual([11, reply.id]);
    const pages = qc.getQueryData<Pages>(commentKeys.replies(7, 10));
    expect(pages?.pages[0]?.items.map((c) => c.id)).toEqual([11, reply.id]);
  });

  it("rolls a failed comment back out of every list and count", async () => {
    const qc = seed();
    const rollback = await optimisticAddComment(qc, draft(threadOf(qc)[0]!));
    rollback();
    expect(threadOf(qc)[0]).toMatchObject({
      replyCount: 1,
      replies: [{ id: 11 }],
    });
    expect(counts(qc)).toEqual({ detail: 3, feed: 3 });
  });

  it("swaps the saved comment in for its draft", async () => {
    const qc = seed();
    const added = draft(null, "Saved soon");
    await optimisticAddComment(qc, added);
    replaceDraft(
      qc,
      added.id,
      comment(12, { body: "Saved soon", canDelete: true })
    );
    expect(threadOf(qc)[0]).toMatchObject({
      id: 12,
      body: "Saved soon",
      canDelete: true,
    });
  });

  it("shows a deleted comment as a placeholder, unpinned and uncounted", async () => {
    const qc = seed();
    const reply = threadOf(qc)[0]!.replies[0]!;
    qc.setQueryData<PostDetail>(postKeys.detail(7), {
      ...detail,
      pinned: reply,
    });
    await optimisticDeleteComment(qc, reply);
    expect(threadOf(qc)[0]?.replies[0]).toMatchObject({
      id: 11,
      deleted: true,
      body: "",
      author: null,
      canDelete: false,
    });
    expect(qc.getQueryData<PostDetail>(postKeys.detail(7))?.pinned).toBeNull();
    expect(counts(qc)).toEqual({ detail: 2, feed: 2 });
  });

  it("pins on the post's page at once, and rolls the pin back", async () => {
    const qc = seed();
    const rollback = await optimisticPin(qc, 7, threadOf(qc)[1]!);
    expect(
      qc.getQueryData<PostDetail>(postKeys.detail(7))?.pinned
    ).toMatchObject({ id: 9, replies: [] });
    rollback();
    expect(qc.getQueryData<PostDetail>(postKeys.detail(7))?.pinned).toBeNull();
  });

  it("writes the server's count wherever the post shows", () => {
    const qc = seed();
    writeCommentCount(qc, 7, 5);
    expect(counts(qc)).toEqual({ detail: 5, feed: 5 });
  });
});
