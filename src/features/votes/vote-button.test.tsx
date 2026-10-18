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
import { type FeedParams, postKeys } from "@/lib/keys";
import { postQueryOptions } from "@/lib/posts";
import type { FeedPage, PostDetail, PostSummary } from "@/shared/posts";
import { VoteButton } from "./vote-button";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastError.mockReset();
});

const summary: PostSummary = {
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
};
const detail: PostDetail = {
  ...summary,
  body: "",
  workspace: { slug: "acme", name: "Acme", defaultLocale: "en" },
  canEdit: false,
};
const feedParams: FeedParams = { sort: "trending", page: 1 };

/**
 * A stand-in for the API. It answers votes after 20 ms, remembers the state,
 * records what it was sent and how many requests overlapped, and serves the
 * post for the refetch after the last vote.
 */
function fakeServer({ fail = false, othersVoted = 0 } = {}) {
  const state = {
    voted: false,
    voteCount: 3 + othersVoted,
    inFlight: 0,
    maxInFlight: 0,
    received: [] as boolean[],
  };
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/posts/7/vote" && init?.method === "PUT") {
      const { voted } = JSON.parse(String(init.body)) as { voted: boolean };
      state.received.push(voted);
      state.inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      state.inFlight -= 1;
      if (fail) {
        return Response.json(
          { success: false, code: "INTERNAL_ERROR", error: "boom" },
          { status: 500 }
        );
      }
      if (voted !== state.voted) {
        state.voted = voted;
        state.voteCount += voted ? 1 : -1;
      }
      return Response.json({
        success: true,
        data: { voted: state.voted, voteCount: state.voteCount },
      });
    }
    if (url.pathname === "/api/posts/7") {
      return Response.json({
        success: true,
        data: { ...detail, voted: state.voted, voteCount: state.voteCount },
      });
    }
    return Response.json(
      { success: false, code: "NOT_FOUND", error: "Not found" },
      { status: 404 }
    );
  });
  vi.stubGlobal("fetch", fetch);
  return state;
}

function Harness() {
  const { data } = useQuery(postQueryOptions(7));
  if (!data) return null;
  return (
    <VoteButton
      postId={data.id}
      title={data.title}
      voted={data.voted}
      voteCount={data.voteCount}
    />
  );
}

function renderButton() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  qc.setQueryData(postKeys.detail(7), detail);
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
  return {
    qc,
    button: screen.getByRole("button", { name: "Vote for Dark mode" }),
  };
}

describe("VoteButton", () => {
  it("ends in the state of the last of several rapid clicks", async () => {
    const server = fakeServer();
    const { qc, button } = renderButton();
    for (const expected of ["true", "false", "true", "false", "true"]) {
      fireEvent.click(button);
      // Each click flips the button at once, long before the server answers.
      await waitFor(() =>
        expect(button.getAttribute("aria-pressed")).toBe(expected)
      );
    }
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(server.received).toEqual([true, false, true, false, true]);
    expect(server.maxInFlight).toBe(1);
    await waitFor(() => expect(button.textContent).toBe("4"));
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("restores the post in every list it's in when the vote fails", async () => {
    fakeServer({ fail: true });
    const { qc, button } = renderButton();
    const feedKey = postKeys.feed("acme", feedParams);
    fireEvent.click(button);
    await waitFor(() =>
      expect(qc.getQueryData<PostDetail>(postKeys.detail(7))?.voteCount).toBe(4)
    );
    expect(qc.getQueryData<FeedPage>(feedKey)?.items[0]?.voteCount).toBe(4);
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Something went wrong on our side. Try again."
      )
    );
    expect(qc.getQueryData<PostDetail>(postKeys.detail(7))).toMatchObject({
      voted: false,
      voteCount: 3,
    });
    expect(qc.getQueryData<FeedPage>(feedKey)?.items[0]).toMatchObject({
      voted: false,
      voteCount: 3,
    });
  });

  it("shows the server's count once the last vote settles", async () => {
    fakeServer({ othersVoted: 6 });
    const { button } = renderButton();
    fireEvent.click(button);
    await waitFor(() => expect(button.textContent).toBe("4"));
    // Six other people voted meanwhile; the server's count wins.
    await waitFor(() => expect(button.textContent).toBe("10"));
  });
});
