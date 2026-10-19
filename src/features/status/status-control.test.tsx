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
import { StatusBadge } from "@/components/status-badge";
import en from "@/i18n/messages/en.json";
import { postQueryOptions } from "@/lib/posts";
import type { PostDetail, StatusChangeView } from "@/shared/posts";
import { StatusControl } from "./status-control";
import { StatusTimeline } from "./status-timeline";

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
  canEdit: true,
  isTeam: true,
  pinned: null,
  subscribed: false,
  timeline: [],
  mergedInto: null,
};

/** The post's API: it answers after 20 ms and keeps the timeline. */
function fakeServer({ failWrites = false } = {}) {
  const state = { detail, received: [] as unknown[] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      await new Promise((resolve) => setTimeout(resolve, 20));
      const ok = (data: unknown) => Response.json({ success: true, data });
      if (url.pathname === "/api/posts/7" && method === "GET") {
        return ok(state.detail);
      }
      if (url.pathname === "/api/posts/7/status" && method === "PATCH") {
        state.received.push(body);
        if (failWrites) {
          return Response.json(
            { success: false, code: "INTERNAL_ERROR", error: "boom" },
            { status: 500 }
          );
        }
        const entry: StatusChangeView = {
          id: state.detail.timeline.length + 1,
          from: state.detail.status,
          to: body.status,
          note: body.note ?? null,
          by: { name: "Ayşe" },
          createdAt: "2026-10-19T00:00:00.000Z",
        };
        state.detail = {
          ...state.detail,
          status: body.status,
          timeline: [...state.detail.timeline, entry],
        };
        return ok(state.detail);
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
  if (!data) return null;
  return (
    <>
      <section aria-label="Current status">
        <StatusBadge status={data.status} />
      </section>
      <StatusControl post={data} />
      <StatusTimeline timeline={data.timeline} />
    </>
  );
}

function renderPost() {
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

const current = () =>
  within(screen.getByRole("region", { name: "Current status" }));

describe("StatusControl", () => {
  it("offers a note only once a new status is picked", () => {
    fakeServer();
    renderPost();
    expect(screen.queryByLabelText(/Note for the timeline/)).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Update status",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "planned" },
    });
    expect(screen.getByLabelText(/Note for the timeline/)).toBeTruthy();
  });

  it("moves the post at once, and puts the note on its timeline", async () => {
    const server = fakeServer();
    renderPost();
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "planned" },
    });
    fireEvent.change(screen.getByLabelText(/Note for the timeline/), {
      target: { value: "  Next month.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));
    expect(await current().findByText("Planned")).toBeTruthy();
    expect(await screen.findByText("Next month.")).toBeTruthy();
    expect(server.received).toEqual([
      { status: "planned", note: "Next month." },
    ]);
    expect(
      screen.getByRole("heading", { name: "Status history" })
    ).toBeTruthy();
  });

  it("puts the status back, with a toast, when the move fails", async () => {
    fakeServer({ failWrites: true });
    renderPost();
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "shipped" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));
    expect(await current().findByText("Shipped")).toBeTruthy();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Something went wrong on our side. Try again."
      )
    );
    expect(await current().findByText("Open")).toBeTruthy();
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "open"
    );
  });
});

describe("StatusTimeline", () => {
  it("shows each change with who made it and their note", () => {
    render(
      <IntlProvider locale="en" messages={en} timeZone="UTC">
        <StatusTimeline
          timeline={[
            {
              id: 1,
              from: "open",
              to: "planned",
              note: "**Next** month.",
              by: { name: "" },
              createdAt: "2026-10-01T00:00:00.000Z",
            },
            {
              id: 2,
              from: "planned",
              to: "shipped",
              note: null,
              by: null,
              createdAt: "2026-10-02T00:00:00.000Z",
            },
          ]}
        />
      </IntlProvider>
    );
    const entries = screen.getAllByRole("listitem");
    expect(within(entries[0]!).getByText("Planned")).toBeTruthy();
    expect(within(entries[0]!).getByText("Next").tagName).toBe("STRONG");
    expect(within(entries[0]!).getByText("Anonymous")).toBeTruthy();
    expect(within(entries[1]!).getByText("Shipped")).toBeTruthy();
  });

  it("shows nothing for a post that never changed", () => {
    const { container } = render(
      <IntlProvider locale="en" messages={en} timeZone="UTC">
        <StatusTimeline timeline={[]} />
      </IntlProvider>
    );
    expect(container.innerHTML).toBe("");
  });
});
