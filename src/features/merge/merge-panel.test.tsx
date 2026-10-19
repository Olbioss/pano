// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import type { PostDetail, PostSummary } from "@/shared/posts";
import { MergePanel } from "./merge-panel";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastError.mockReset();
});

const summary = (id: number, title: string): PostSummary => ({
  id,
  ref: `${id}-${title.toLowerCase().replace(/ /g, "-")}`,
  title,
  excerpt: "",
  status: "open",
  voteCount: 3,
  commentCount: 0,
  voted: false,
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

const duplicate = detailOf(summary(7, "Dark theme"));
const original = summary(3, "Dark mode");

/** The feed search and the merge endpoint. */
function fakeServer({ refuse = false } = {}) {
  const state = { received: [] as unknown[] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      await new Promise((resolve) => setTimeout(resolve, 20));
      const ok = (data: unknown) => Response.json({ success: true, data });
      if (url.pathname === "/api/workspaces/acme/posts" && method === "GET") {
        // The search finds the post itself too; the panel leaves it out.
        return ok({
          items: [original, summary(7, "Dark theme")],
          page: 1,
          hasMore: false,
        });
      }
      if (url.pathname === "/api/posts/7/merge" && method === "POST") {
        state.received.push(JSON.parse(String(init?.body)));
        if (refuse) {
          return Response.json(
            {
              success: false,
              code: "BAD_REQUEST",
              error: "Merge into an unmerged post of the same workspace",
              fields: { intoId: "MERGE_TARGET" },
            },
            { status: 400 }
          );
        }
        return ok({ ...detailOf(original), voteCount: 6 });
      }
      return Response.json(
        { success: false, code: "NOT_FOUND", error: "Not found" },
        { status: 404 }
      );
    })
  );
  return state;
}

function renderPanel(onMerged = vi.fn(async () => {})) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={qc}>
        <MergePanel post={duplicate} onMerged={onMerged} />
      </QueryClientProvider>
    </IntlProvider>
  );
  return { onMerged };
}

async function pickOriginal() {
  fireEvent.click(
    screen.getByRole("button", { name: "Merge into another request" })
  );
  fireEvent.change(screen.getByLabelText("Find the request to merge into"), {
    target: { value: "dark" },
  });
  fireEvent.click(
    await screen.findByRole("button", { name: "Merge into “Dark mode”" })
  );
}

describe("MergePanel", () => {
  it("finds the original, asks first, and goes there once merged", async () => {
    const server = fakeServer();
    const { onMerged } = renderPanel();
    await pickOriginal();
    expect(
      screen.getByText(/Its votes, comments and subscribers/)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm merge" }));
    await waitFor(() => expect(onMerged).toHaveBeenCalledOnce());
    expect(onMerged.mock.calls[0]).toMatchObject([{ id: 3, voteCount: 6 }]);
    expect(server.received).toEqual([{ intoId: 3 }]);
  });

  it("leaves the post itself out of the search", async () => {
    fakeServer();
    renderPanel();
    fireEvent.click(
      screen.getByRole("button", { name: "Merge into another request" })
    );
    fireEvent.change(screen.getByLabelText("Find the request to merge into"), {
      target: { value: "dark" },
    });
    expect(
      await screen.findByRole("button", { name: "Merge into “Dark mode”" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Merge into “Dark theme”" })
    ).toBeNull();
  });

  it("says why when the original can't take the merge", async () => {
    fakeServer({ refuse: true });
    const { onMerged } = renderPanel();
    await pickOriginal();
    fireEvent.click(screen.getByRole("button", { name: "Confirm merge" }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Pick a request from this workspace that hasn't been merged."
      )
    );
    expect(onMerged).not.toHaveBeenCalled();
  });
});
