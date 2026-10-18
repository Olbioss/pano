// @vitest-environment jsdom
import {
  onlineManager,
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
import { commentKeys, type FeedParams, postKeys } from "@/lib/keys";
import { postQueryOptions } from "@/lib/posts";
import type { CommentView } from "@/shared/comments";
import type { FeedPage, PostDetail, PostSummary } from "@/shared/posts";
import { CommentThread } from "./comment-thread";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastError.mockReset();
  onlineManager.setOnline(true);
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

type ServerOptions = {
  top?: CommentView[];
  pinnedId?: number | null;
  /** Every write answers 500. */
  failWrites?: boolean;
  /** The signed-in person is on the workspace's team. */
  isTeam?: boolean;
  /** The signed-in person's name: "" until they pick one. */
  viewerName?: string;
};

/**
 * A stand-in for the API that keeps the thread in memory. It answers after
 * 20 ms, pages top-level comments three at a time, lists each comment's
 * latest two replies with it, and records every write in `received`.
 */
function fakeServer({
  top,
  pinnedId = null,
  failWrites = false,
  isTeam = false,
  viewerName = "Bora",
}: ServerOptions = {}) {
  const start = startingThread();
  const state = {
    top: top ?? start.top,
    replies: start.replies,
    pinnedId,
    commentCount: 6,
    name: viewerName,
    nextId: 100,
    received: [] as unknown[],
    /** Extra waits, in ms, on every read and on every write. */
    readDelay: 0,
    writeDelay: 0,
    /** Every read but /api/me answers 500. */
    failReads: false,
    /** How many of the next writes answer 500. */
    failNext: 0,
    /** Every request fails the way fetch does without a connection. */
    offline: false,
  };
  const writeFails = () => {
    if (failWrites) return true;
    if (state.failNext === 0) return false;
    state.failNext -= 1;
    return true;
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
  const pinnedView = () => {
    const pinned = state.pinnedId === null ? undefined : find(state.pinnedId);
    return pinned ? { ...pinned, replies: [] } : null;
  };
  const ok = (data: unknown, status = 200) =>
    Response.json({ success: true, data }, { status });
  const failed = () =>
    Response.json(
      { success: false, code: "INTERNAL_ERROR", error: "boom" },
      { status: 500 }
    );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      if (state.offline) throw new TypeError("Failed to fetch");
      const extra = method === "GET" ? state.readDelay : state.writeDelay;
      await new Promise((resolve) => setTimeout(resolve, 20 + extra));
      if (state.failReads && method === "GET" && url.pathname !== "/api/me") {
        return failed();
      }
      if (url.pathname === "/api/me") {
        if (method === "PATCH") {
          state.received.push(body);
          state.name = body.name;
        }
        return ok({
          user: { id: "u1", name: state.name, email: "bora@example.com" },
          workspaces: [],
        });
      }
      if (url.pathname === "/api/posts/7" && method === "GET") {
        return ok({
          ...detail,
          commentCount: state.commentCount,
          isTeam,
          pinned: pinnedView(),
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
      if (url.pathname === "/api/posts/7/comments" && method === "POST") {
        state.received.push(body);
        if (writeFails()) return failed();
        const saved = comment(state.nextId++, body.body, {
          parentId: body.parentId ?? null,
          depth: body.parentId ? 1 : 0,
          author: { name: state.name },
          official: isTeam,
          canDelete: true,
        });
        if (saved.parentId === null) {
          state.top.unshift(saved);
        } else {
          const siblings = state.replies.get(saved.parentId) ?? [];
          state.replies.set(saved.parentId, [...siblings, saved]);
          const parent = find(saved.parentId);
          if (parent) parent.replyCount += 1;
        }
        state.commentCount += 1;
        return ok({ comment: saved, commentCount: state.commentCount }, 201);
      }
      const replies = /^\/api\/comments\/(\d+)\/replies$/.exec(url.pathname);
      if (replies && method === "GET") {
        return ok({
          items: (state.replies.get(Number(replies[1])) ?? []).map(withLatest),
          hasMore: false,
        });
      }
      const one = /^\/api\/comments\/(\d+)$/.exec(url.pathname);
      const target = one ? find(Number(one[1])) : undefined;
      if (target && method === "DELETE") {
        state.received.push({ deleted: target.id });
        if (writeFails()) return failed();
        Object.assign(target, {
          deleted: true,
          body: "",
          author: null,
          official: false,
          canDelete: false,
        });
        state.commentCount -= 1;
        if (state.pinnedId === target.id) state.pinnedId = null;
        return ok({
          comment: { ...target, replies: [] },
          commentCount: state.commentCount,
        });
      }
      if (url.pathname === "/api/posts/7/pin" && method === "PUT") {
        state.received.push(body);
        if (writeFails()) return failed();
        state.pinnedId = body.commentId;
        return ok({ pinned: pinnedView() });
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

const feedCount = (qc: QueryClient) =>
  qc.getQueryData<FeedPage>(postKeys.feed("acme", feedParams))?.items[0]
    ?.commentCount;

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

describe("changing the thread", () => {
  it("shows a new comment at once, greyed out, and keeps it once saved", async () => {
    const server = fakeServer();
    renderThread();
    await screen.findByText("Comment A");
    const box = (await screen.findByLabelText(
      "Add a comment"
    )) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Count me in" } });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    const list = screen.getByRole("list", { name: "Comments" });
    const draft = await within(list).findByText("Count me in");
    expect(draft.closest("li")?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("heading", { name: "7 comments" })).toBeTruthy();
    expect(box.value).toBe("");
    await waitFor(() =>
      expect(
        within(list)
          .getByText("Count me in")
          .closest("li")
          ?.hasAttribute("aria-busy")
      ).toBe(false)
    );
    expect(server.received).toEqual([{ body: "Count me in" }]);
    expect(screen.getByRole("heading", { name: "7 comments" })).toBeTruthy();
  });

  it("removes a failed comment, puts its text back, and restores the counts", async () => {
    fakeServer({ failWrites: true });
    const { qc } = renderThread();
    await screen.findByText("Comment A");
    const box = (await screen.findByLabelText(
      "Add a comment"
    )) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Count me in" } });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    const list = screen.getByRole("list", { name: "Comments" });
    expect(await within(list).findByText("Count me in")).toBeTruthy();
    expect(feedCount(qc)).toBe(7);
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Something went wrong on our side. Try again."
      )
    );
    await waitFor(() =>
      expect(within(list).queryByText("Count me in")).toBeNull()
    );
    await waitFor(() => expect(box.value).toBe("Count me in"));
    expect(screen.getByRole("heading", { name: "6 comments" })).toBeTruthy();
    expect(feedCount(qc)).toBe(6);
  });

  it("posts a reply under its parent, and closes the reply box once saved", async () => {
    const server = fakeServer();
    renderThread();
    const parent = await itemOf("Comment A");
    const [reply] = await within(parent).findAllByRole("button", {
      name: "Reply",
    });
    fireEvent.click(reply!);
    const box = await screen.findByLabelText("Your reply");
    fireEvent.change(box, { target: { value: "Same here" } });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));
    // The box's own text matches too, until it empties: look for the comment.
    const draft = await within(parent).findByText("Same here", {
      selector: "p",
    });
    expect(draft.closest("li")?.getAttribute("aria-busy")).toBe("true");
    await waitFor(() =>
      expect(screen.queryByLabelText("Your reply")).toBeNull()
    );
    expect(server.received).toEqual([{ body: "Same here", parentId: 10 }]);
    expect(
      within(parent).getByText("Same here", { selector: "p" })
    ).toBeTruthy();
  });

  it("keeps one reply box open at a time", async () => {
    fakeServer();
    renderThread();
    const first = await itemOf("Comment A");
    const mine = await itemOf("My comment");
    const [replyToFirst] = await within(first).findAllByRole("button", {
      name: "Reply",
    });
    fireEvent.click(replyToFirst!);
    fireEvent.click(within(mine).getByRole("button", { name: "Reply" }));
    expect(screen.getAllByLabelText("Your reply")).toHaveLength(1);
    expect(within(mine).getByLabelText("Your reply")).toBeTruthy();
  });

  it("deletes a comment after a confirm, keeping its place", async () => {
    const server = fakeServer();
    renderThread();
    const mine = await itemOf("My comment");
    fireEvent.click(
      await within(mine).findByRole("button", { name: "Delete" })
    );
    fireEvent.click(
      within(mine).getByRole("button", { name: "Confirm delete" })
    );
    expect(await within(mine).findByText("Comment deleted")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "5 comments" })).toBeTruthy();
    await waitFor(() => expect(server.received).toEqual([{ deleted: 8 }]));
  });

  it("puts a comment back when deleting it fails", async () => {
    fakeServer({ failWrites: true });
    renderThread();
    const mine = await itemOf("My comment");
    fireEvent.click(
      await within(mine).findByRole("button", { name: "Delete" })
    );
    fireEvent.click(
      within(mine).getByRole("button", { name: "Confirm delete" })
    );
    expect(await within(mine).findByText("Comment deleted")).toBeTruthy();
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    await waitFor(() =>
      expect(within(mine).getByText("My comment")).toBeTruthy()
    );
    expect(screen.getByRole("heading", { name: "6 comments" })).toBeTruthy();
  });

  it("pins a comment above the thread, and unpins it", async () => {
    const server = fakeServer({ isTeam: true });
    renderThread({ isTeam: true });
    const mine = await itemOf("My comment");
    fireEvent.click(await within(mine).findByRole("button", { name: "Pin" }));
    const pinned = await screen.findByRole("region", {
      name: "Pinned by the team",
    });
    expect(within(pinned).getByText("My comment")).toBeTruthy();
    await waitFor(() => expect(server.pinnedId).toBe(8));
    fireEvent.click(within(pinned).getByRole("button", { name: "Unpin" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Pinned by the team" })
      ).toBeNull()
    );
    await waitFor(() => expect(server.pinnedId).toBeNull());
  });

  it("asks for a name first when the account has none", async () => {
    const server = fakeServer({ viewerName: "" });
    renderThread();
    await screen.findByText("Comment A");
    fireEvent.change(await screen.findByLabelText("Your name"), {
      target: { value: "Deniz" },
    });
    fireEvent.change(screen.getByLabelText("Add a comment"), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    const list = screen.getByRole("list", { name: "Comments" });
    const draft = await within(list).findByText("Hello");
    const item = draft.closest("li");
    expect(item && within(item).getByText("Deniz")).toBeTruthy();
    expect(server.received[0]).toEqual({ name: "Deniz" });
    await waitFor(() =>
      expect(screen.queryByLabelText("Your name")).toBeNull()
    );
  });
});

describe("when requests fail", () => {
  it("puts a failed comment's text back at once, without waiting on reads", async () => {
    const server = fakeServer({ failWrites: true });
    renderThread();
    await screen.findByText("Comment A");
    server.readDelay = 3000;
    const box = (await screen.findByLabelText(
      "Add a comment"
    )) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Count me in" } });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    await waitFor(() => expect(box.value).toBe("Count me in"), {
      timeout: 1000,
    });
  });

  it("gives a failed comment its text back while another is still sending", async () => {
    const server = fakeServer();
    server.failNext = 1;
    server.writeDelay = 200;
    renderThread();
    await screen.findByText("Comment A");
    const box = (await screen.findByLabelText(
      "Add a comment"
    )) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "First thought" } });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() => expect(box.value).toBe(""));
    fireEvent.change(box, { target: { value: "Second thought" } });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(box.value).toBe("First thought"));
    const list = screen.getByRole("list", { name: "Comments" });
    expect(
      await within(list).findByText("Second thought", { selector: "p" })
    ).toBeTruthy();
    expect(
      within(list).queryByText("First thought", { selector: "p" })
    ).toBeNull();
  });

  it("fails a comment at once when offline, instead of holding it", async () => {
    const server = fakeServer();
    renderThread();
    await screen.findByText("Comment A");
    onlineManager.setOnline(false);
    server.offline = true;
    const box = (await screen.findByLabelText(
      "Add a comment"
    )) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Count me in" } });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Couldn't reach Pano. Check your connection and try again."
      )
    );
    const list = screen.getByRole("list", { name: "Comments" });
    await waitFor(() =>
      expect(within(list).queryByText("Count me in")).toBeNull()
    );
    await waitFor(() => expect(box.value).toBe("Count me in"));
    expect(screen.getByRole("heading", { name: "6 comments" })).toBeTruthy();
  });

  it("keeps the comments it has when reading them again fails", async () => {
    const server = fakeServer();
    const { qc } = renderThread();
    await screen.findByText("Comment A");
    server.failReads = true;
    await qc.invalidateQueries({ queryKey: commentKeys.post(7) });
    await waitFor(() =>
      expect(qc.getQueryState(commentKeys.thread(7))?.status).toBe("error")
    );
    expect(screen.getByText("Comment A")).toBeTruthy();
    expect(screen.queryByText(/Couldn't load comments/)).toBeNull();
  });

  it("keeps the comments it has when older ones fail to load", async () => {
    const server = fakeServer();
    const { qc } = renderThread();
    const older = await screen.findByRole("button", {
      name: "Show older comments",
    });
    server.failReads = true;
    fireEvent.click(older);
    await waitFor(() =>
      expect(qc.getQueryState(commentKeys.thread(7))?.status).toBe("error")
    );
    expect(screen.getByText("Comment A")).toBeTruthy();
    expect(screen.queryByText(/Couldn't load comments/)).toBeNull();
  });
});
