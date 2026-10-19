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
} from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import { postQueryOptions } from "@/lib/posts";
import type { PostDetail } from "@/shared/posts";
import { SubscribeButton } from "./subscribe-button";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastError.mockReset();
});

const detail: PostDetail = {
  id: 7,
  ref: "7-dark-mode",
  title: "Dark mode",
  excerpt: "",
  status: "open",
  voteCount: 3,
  commentCount: 0,
  voted: false,
  board: { slug: "features", name: "Features" },
  author: { name: "Ayşe" },
  createdAt: "2026-10-01T00:00:00.000Z",
  body: "",
  workspace: { slug: "acme", name: "Acme", defaultLocale: "en" },
  canEdit: false,
  isTeam: false,
  pinned: null,
  subscribed: false,
  timeline: [],
  mergedInto: null,
};

function fakeServer({ failWrites = false } = {}) {
  const state = { subscribed: false, received: [] as unknown[] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      await new Promise((resolve) => setTimeout(resolve, 20));
      const ok = (data: unknown) => Response.json({ success: true, data });
      if (url.pathname === "/api/posts/7" && method === "GET") {
        return ok({ ...detail, subscribed: state.subscribed });
      }
      if (url.pathname === "/api/posts/7/subscription" && method === "PUT") {
        const body = JSON.parse(String(init?.body));
        state.received.push(body);
        if (failWrites) {
          return Response.json(
            { success: false, code: "INTERNAL_ERROR", error: "boom" },
            { status: 500 }
          );
        }
        state.subscribed = body.subscribed;
        return ok({ subscribed: state.subscribed });
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
  return data ? <SubscribeButton post={data} /> : null;
}

function renderButton() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  qc.setQueryData(postQueryOptions(7).queryKey, detail);
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={qc}>
        <Harness />
      </QueryClientProvider>
    </IntlProvider>
  );
}

describe("SubscribeButton", () => {
  it("subscribes at once, and unsubscribes", async () => {
    const server = fakeServer();
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(
      await screen.findByRole("button", { name: "Unsubscribe" })
    ).toBeTruthy();
    await waitFor(() => expect(server.subscribed).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
    expect(
      await screen.findByRole("button", { name: "Subscribe" })
    ).toBeTruthy();
    await waitFor(() =>
      expect(server.received).toEqual([
        { subscribed: true },
        { subscribed: false },
      ])
    );
  });

  it("flips back, with a toast, when it fails", async () => {
    fakeServer({ failWrites: true });
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(
      await screen.findByRole("button", { name: "Unsubscribe" })
    ).toBeTruthy();
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(
      await screen.findByRole("button", { name: "Subscribe" })
    ).toBeTruthy();
  });
});
