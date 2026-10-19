import { QueryClient } from "@tanstack/react-query";
import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { optimisticVote } from "@/features/votes/vote-cache";
import { type FeedParams, postKeys } from "@/lib/keys";
import type {
  FeedPage,
  PostDetail,
  PostSummary,
  Roadmap,
} from "@/shared/posts";
import { cardOf, optimisticStatus, placeOnRoadmap } from "./status-cache";

const post = (
  id: number,
  overrides: Partial<PostSummary> = {}
): PostSummary => ({
  id,
  ref: `${id}-post`,
  title: `Post ${id}`,
  excerpt: "",
  status: "planned",
  voteCount: 1,
  commentCount: 0,
  voted: false,
  board: { slug: "features", name: "Features" },
  author: { name: "Ayşe" },
  createdAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

const detailOf = (summary: PostSummary): PostDetail => ({
  ...summary,
  body: "A long body.",
  workspace: { slug: "acme", name: "Acme", defaultLocale: "en" },
  canEdit: true,
  isTeam: true,
  pinned: null,
  subscribed: true,
  timeline: [],
  mergedInto: null,
});

const board = (): Roadmap => ({
  planned: [post(1, { voteCount: 5 }), post(2, { voteCount: 2 })],
  in_progress: [
    post(3, { status: "in_progress", voteCount: 4 }),
    post(4, { status: "in_progress", voteCount: 1 }),
  ],
  shipped: [post(5, { status: "shipped" })],
});

const columns = (roadmap: Roadmap | undefined) => ({
  planned: roadmap?.planned.map((item) => item.id),
  in_progress: roadmap?.in_progress.map((item) => item.id),
  shipped: roadmap?.shipped.map((item) => item.id),
});

describe("placeOnRoadmap", () => {
  it("moves a card into its new column, most voted first", () => {
    const next = produce(board(), (draft) => {
      placeOnRoadmap(draft, cardOf(post(1, { voteCount: 3 }), "in_progress"));
    });
    expect(columns(next)).toEqual({
      planned: [2],
      in_progress: [3, 1, 4],
      shipped: [5],
    });
  });

  it("puts a shipped card first", () => {
    const next = produce(board(), (draft) => {
      placeOnRoadmap(draft, cardOf(post(4), "shipped"));
    });
    expect(columns(next).shipped).toEqual([4, 5]);
  });

  it("takes a card off for a status the roadmap doesn't show", () => {
    const next = produce(board(), (draft) => {
      placeOnRoadmap(draft, cardOf(post(2), "closed"));
    });
    expect(columns(next).planned).toEqual([1]);
  });

  it("adds a card it didn't have", () => {
    const next = produce(board(), (draft) => {
      placeOnRoadmap(draft, cardOf(post(9, { voteCount: 10 }), "planned"));
    });
    expect(columns(next).planned).toEqual([9, 1, 2]);
  });
});

describe("cardOf", () => {
  it("keeps only what a card shows, at the new status", () => {
    const card = cardOf(detailOf(post(7)), "shipped");
    expect(card).toEqual({ ...post(7), status: "shipped" });
  });
});

describe("optimisticStatus", () => {
  const feedParams: FeedParams = { sort: "trending", page: 1 };
  const empty: Roadmap = { planned: [], in_progress: [], shipped: [] };

  function seed() {
    const qc = new QueryClient();
    qc.setQueryData(postKeys.roadmap("acme"), board());
    qc.setQueryData(postKeys.roadmap("other"), empty);
    qc.setQueryData(postKeys.detail(2), detailOf(post(2)));
    qc.setQueryData<FeedPage>(postKeys.feed("acme", feedParams), {
      items: [post(2)],
      page: 1,
      hasMore: false,
    });
    return qc;
  }

  it("moves the card on its own workspace's roadmap, and relabels every copy", async () => {
    const qc = seed();
    await optimisticStatus(qc, {
      post: post(2),
      workspace: "acme",
      status: "shipped",
    });
    expect(columns(qc.getQueryData(postKeys.roadmap("acme")))).toEqual({
      planned: [1],
      in_progress: [3, 4],
      shipped: [2, 5],
    });
    expect(qc.getQueryData<PostDetail>(postKeys.detail(2))?.status).toBe(
      "shipped"
    );
    expect(
      qc.getQueryData<FeedPage>(postKeys.feed("acme", feedParams))?.items[0]
        ?.status
    ).toBe("shipped");
    expect(qc.getQueryData(postKeys.roadmap("other"))).toEqual(empty);
  });

  it("rolls every copy back", async () => {
    const qc = seed();
    const before = qc.getQueryData(postKeys.roadmap("acme"));
    const rollback = await optimisticStatus(qc, {
      post: post(2),
      workspace: "acme",
      status: "closed",
    });
    rollback();
    expect(qc.getQueryData(postKeys.roadmap("acme"))).toEqual(before);
    expect(qc.getQueryData<PostDetail>(postKeys.detail(2))?.status).toBe(
      "planned"
    );
  });
});

describe("a vote", () => {
  it("counts on the roadmap's card too", async () => {
    const qc = new QueryClient();
    qc.setQueryData(postKeys.roadmap("acme"), board());
    await optimisticVote(qc, 2, true);
    expect(
      qc.getQueryData<Roadmap>(postKeys.roadmap("acme"))?.planned[1]
    ).toMatchObject({ id: 2, voted: true, voteCount: 3 });
  });
});
