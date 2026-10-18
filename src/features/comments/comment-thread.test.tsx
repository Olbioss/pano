// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import { type FeedParams, postKeys } from "@/lib/keys";
import { postQueryOptions } from "@/lib/posts";
import type { CommentView } from "@/shared/comments";
import type { PostDetail, PostSummary } from "@/shared/posts";
import { CommentThread } from "./comment-thread";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const comment = (
  id: number,
  body: string,
  overrides: Partial<CommentView> = {}
): CommentView => ({
  id,
  postId: 7,
  parentId: null,
  depth: 0,
  body,
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
  commentCount: 6,
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
};
const feedParams: FeedParams = { sort: "trending", page: 1 };

/**
 * What the fake server starts with: four top-level comments, newest first,
 * one of them deleted, and three replies to the newest. Six aren't deleted.
 */
function startingThread() {
  return {
    top: [
      comment(10, "Comment A", { replyCount: 3 }),
      comment(8, "My comment", { author: { name: "Bora" }, canDelete: true }),
      comment(6, "", { deleted: true, author: null }),
      comment(5, "Comment C"),
    ],
    replies: new Map<number, CommentView[]>([
      [
        10,
        [
          comment(11, "Reply 11", { parentId: 10, depth: 1 }),
          comment(12, "Reply 12", {
            parentId: 10,
            depth: 1,
            author: { name: "Bora" },
          }),
          comment(13, "Reply 13", {
            parentId: 10,
            depth: 1,
            author: { name: "Can" },
            official: true,
          }),
        ],
      ],
    ]),
  };
}

type ServerOptions = { top?: CommentView[]; pinnedId?: number | null };

/**
 * A stand-in for the API that keeps the thread in memory. It answers after
 * 20 ms, pages top-level comments three at a time, and lists each comment's
 * latest two replies with it.
 */
function fakeServer({ top, pinnedId = null }: ServerOptions = {}) {
  const start = startingThread();
  const state = {
    top: top ?? start.top,
    replies: start.replies,
    pinnedId,
    commentCount: 6,
  };
  const find = (id: number) =>
    [...state.top, ...[...state.replies.values()].flat()].find(
      (c) => c.id === id
    );
  const withLatest = (c: CommentView): CommentView => ({
    ...c,
    replies: (state.replies.get(c.id) ?? [])
      .slice(-2)
      .map((reply) => ({ ...reply, replies: [] })),
  });
  const ok = (data: unknown, status = 200) =>
    Response.json({ success: true, data }, { status });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (url.pathname === "/api/me") {
        return ok({
          user: { id: "u1", name: "Bora", email: "bora@example.com" },
          workspaces: [],
        });
      }
      if (url.pathname === "/api/posts/7" && method === "GET") {
        const pinned =
          state.pinnedId === null ? undefined : find(state.pinnedId);
        return ok({
          ...detail,
          commentCount: state.commentCount,
          pinned: pinned ? { ...pinned, replies: [] } : null,
        });
      }
      if (url.pathname === "/api/posts/7/comments" && method === "GET") {
        const before = Number(
          url.searchParams.get("before") ?? Number.POSITIVE_INFINITY
        );
        const older = state.top.filter((c) => c.id < before);
        return ok({
          items: older.slice(0, 3).map(withLatest),
          hasMore: older.length > 3,
        });
      }
      const replies = /^\/api\/comments\/(\d+)\/replies$/.exec(url.pathname);
      if (replies && method === "GET") {
        return ok({
          items: (state.replies.get(Number(replies[1])) ?? []).map(withLatest),
          hasMore: false,
        });
      }
      return Response.json(
        { success: false, code: "NOT_FOUND", error: "Not found" },
        { status: 404 }
      );
    })
  );
  return state;
}

function Harness() {
  const { data } = useQuery(postQueryOptions(7));
  return data ? <CommentThread post={data} /> : null;
}

/** The thread under the post, with the post and a feed page already cached. */
function renderThread(post: Partial<PostDetail> = {}) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  qc.setQueryData(postKeys.detail(7), { ...detail, ...post });
  qc.setQueryData(postKeys.feed("acme", feedParams), {
    items: [summary],
    page: 1,
    hasMore: false,
  });
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={qc}>
        <Harness />
      </QueryClientProvider>
    </IntlProvider>
  );
  return { qc };
}

/** The comment a piece of text belongs to. */
async function itemOf(text: string) {
  const node = await screen.findByText(text);
  const item = node.closest("li");
  if (!item) throw new Error(`"${text}" isn't in a comment`);
  return item;
}

describe("CommentThread", () => {
  it("shows comments with their latest replies, the Team badge and deleted placeholders", async () => {
    fakeServer();
    renderThread();
    expect(await screen.findByText("Comment A")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "6 comments" })).toBeTruthy();
    expect(screen.getByText("Reply 12")).toBeTruthy();
    expect(screen.queryByText("Reply 11")).toBeNull();
    expect(within(await itemOf("Reply 13")).getByText("Team")).toBeTruthy();
    expect(screen.getByText("Comment deleted")).toBeTruthy();
  });

  it("shows earlier replies on request, oldest first", async () => {
    fakeServer();
    renderThread();
    fireEvent.click(
      await screen.findByRole("button", { name: "Show 1 earlier reply" })
    );
    expect(await screen.findByText("Reply 11")).toBeTruthy();
    const order = screen
      .getAllByText(/^Reply \d+$/)
      .map((node) => node.textContent);
    expect(order).toEqual(["Reply 11", "Reply 12", "Reply 13"]);
    expect(screen.queryByRole("button", { name: /earlier repl/ })).toBeNull();
  });

  it("loads older comments on request", async () => {
    fakeServer();
    renderThread();
    fireEvent.click(
      await screen.findByRole("button", { name: "Show older comments" })
    );
    expect(await screen.findByText("Comment C")).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Show older comments" })
      ).toBeNull()
    );
  });

  it("shows the pinned comment above the thread, and marks it in place", async () => {
    fakeServer({ pinnedId: 8 });
    renderThread({
      pinned: comment(8, "My comment", { author: { name: "Bora" } }),
    });
    const pinned = await screen.findByRole("region", {
      name: "Pinned by the team",
    });
    expect(within(pinned).getByText("My comment")).toBeTruthy();
    const list = await screen.findByRole("list", { name: "Comments" });
    expect(within(list).getByText("Pinned")).toBeTruthy();
  });

  it("renders a comment's Markdown without its HTML", async () => {
    fakeServer({
      top: [comment(20, 'This is **bold** <img src="x" onerror="alert(1)">')],
    });
    renderThread();
    expect((await screen.findByText("bold")).tagName).toBe("STRONG");
    expect(document.querySelector("li img")).toBeNull();
  });

  it("hides and shows a comment's replies", async () => {
    fakeServer();
    renderThread();
    const item = await itemOf("Comment A");
    fireEvent.click(within(item).getByRole("button", { name: "Hide replies" }));
    expect(screen.queryByText("Reply 12")).toBeNull();
    fireEvent.click(within(item).getByRole("button", { name: "Show replies" }));
    expect(screen.getByText("Reply 12")).toBeTruthy();
  });
});
