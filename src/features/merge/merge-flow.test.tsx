// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/provider";
import { routeTree } from "@/routeTree.gen";
import type { PostDetail, PostSummary } from "@/shared/posts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const summary = (id: number, title: string, ref: string): PostSummary => ({
  id,
  ref,
  title,
  excerpt: "",
  status: "open",
  voteCount: 2,
  commentCount: 0,
  voted: true,
  board: { slug: "features", name: "Features" },
  author: { name: "Ayşe" },
  createdAt: "2026-10-01T00:00:00.000Z",
});

const detailOf = (post: PostSummary): PostDetail => ({
  ...post,
  body: "",
  workspace: { slug: "acme", name: "Acme", defaultLocale: "en" },
  canEdit: true,
  isTeam: true,
  pinned: null,
  subscribed: true,
  timeline: [],
  mergedInto: null,
});

const duplicate = summary(7, "Dark theme", "7-dark-theme");
const original = summary(3, "Dark mode", "3-dark-mode");

/** The API behind the post page, the merge search and the merge. */
function fakeServer() {
  const received: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      received.push(`${method} ${url.pathname}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const ok = (data: unknown) => Response.json({ success: true, data });
      if (url.pathname === "/api/me") {
        return ok({
          user: { id: "u1", name: "Ayşe", email: "ayse@example.com" },
          workspaces: [],
        });
      }
      if (url.pathname === "/api/posts/7" && method === "GET") {
        return ok(detailOf(duplicate));
      }
      if (url.pathname === "/api/posts/3" && method === "GET") {
        return ok(detailOf(original));
      }
      if (/^\/api\/posts\/\d+\/comments$/.test(url.pathname)) {
        return ok({ items: [], hasMore: false });
      }
      if (url.pathname === "/api/workspaces/acme/posts") {
        return ok({ items: [original, duplicate], page: 1, hasMore: false });
      }
      if (url.pathname === "/api/posts/7/merge" && method === "POST") {
        return ok({ ...detailOf(original), voteCount: 3 });
      }
      return Response.json(
        { success: false, code: "NOT_FOUND", error: "Not found" },
        { status: 404 }
      );
    })
  );
  return received;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nProvider>
  );
  return router;
}

describe("merging from a post's page", () => {
  it("lands on the original with a fresh page: no open panel or draft from the duplicate", async () => {
    const received = fakeServer();
    const router = renderAt("/p/7-dark-theme");
    await screen.findByRole("heading", { name: "Dark theme" });
    // An edit left open, unsaved, on the duplicate.
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Dark theme, edited" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Merge into another request" })
    );
    fireEvent.change(screen.getByLabelText("Find the request to merge into"), {
      target: { value: "dark" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Merge into “Dark mode”" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm merge" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/p/3-dark-mode")
    );
    expect(
      await screen.findByRole("heading", { name: "Dark mode" })
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm merge" })).toBeNull();
    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Merge into another request" })
    ).toBeTruthy();
    expect(received).toContain("POST /api/posts/7/merge");
    expect(received.filter((call) => call.startsWith("PATCH"))).toEqual([]);
  });
});
