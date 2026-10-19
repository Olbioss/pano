// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import { roadmapQueryOptions } from "@/lib/posts";
import type { PostSummary, Roadmap } from "@/shared/posts";
import { ROADMAP_STATUSES, type RoadmapStatus } from "@/shared/status";
import { RoadmapBoard } from "./roadmap-board";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

/**
 * jsdom lays nothing out, and dnd-kit finds columns by their boxes: each
 * column gets a box side by side, and anything inside it a card's box near
 * its top.
 */
function layout(this: HTMLElement) {
  const column = this.closest<HTMLElement>("[data-roadmap-column]");
  const index = column
    ? ROADMAP_STATUSES.indexOf(column.dataset.roadmapColumn as RoadmapStatus)
    : -1;
  const [left, top, width, height] =
    index === -1
      ? [0, 0, 0, 0]
      : this === column
        ? [index * 300, 0, 280, 600]
        : [index * 300 + 10, 60, 260, 80];
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    layout
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  toastError.mockReset();
});

const card = (
  id: number,
  title: string,
  status: RoadmapStatus,
  voteCount = 1
): PostSummary => ({
  id,
  ref: `${id}-${title.toLowerCase().replace(/ /g, "-")}`,
  title,
  excerpt: "",
  status,
  voteCount,
  commentCount: 0,
  voted: false,
  board: { slug: "features", name: "Features" },
  author: { name: "Ayşe" },
  createdAt: "2026-10-01T00:00:00.000Z",
});

const startingRoadmap = (): Roadmap => ({
  planned: [card(1, "Dark mode", "planned", 5), card(2, "Export", "planned")],
  in_progress: [card(3, "Faster search", "in_progress", 3)],
  shipped: [],
});

/** The roadmap's API, keeping moves, answering after 20 ms. */
function fakeServer({ failWrites = false } = {}) {
  const state = { roadmap: startingRoadmap(), received: [] as unknown[] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      await new Promise((resolve) => setTimeout(resolve, 20));
      const ok = (data: unknown) => Response.json({ success: true, data });
      if (url.pathname === "/api/workspaces/acme/roadmap") {
        return ok(state.roadmap);
      }
      const status = /^\/api\/posts\/(\d+)\/status$/.exec(url.pathname);
      if (status && method === "PATCH") {
        const body = JSON.parse(String(init?.body));
        state.received.push({ id: Number(status[1]), ...body });
        if (failWrites) {
          return Response.json(
            { success: false, code: "INTERNAL_ERROR", error: "boom" },
            { status: 500 }
          );
        }
        const moved = ROADMAP_STATUSES.flatMap(
          (column) => state.roadmap[column]
        ).find((post) => post.id === Number(status[1]));
        for (const column of ROADMAP_STATUSES) {
          state.roadmap[column] = state.roadmap[column].filter(
            (post) => post.id !== moved?.id
          );
        }
        if (moved) {
          state.roadmap[body.status as RoadmapStatus].unshift({
            ...moved,
            status: body.status,
          });
        }
        return ok({ ...moved, status: body.status });
      }
      return Response.json(
        { success: false, code: "NOT_FOUND", error: "Not found" },
        { status: 404 }
      );
    })
  );
  return state;
}

function renderBoard({ isTeam }: { isTeam: boolean }) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  qc.setQueryData(roadmapQueryOptions("acme").queryKey, startingRoadmap());
  function Board() {
    const { data } = useQuery(roadmapQueryOptions("acme"));
    return data ? (
      <RoadmapBoard workspace="acme" roadmap={data} isTeam={isTeam} signedIn />
    ) : null;
  }
  const router = createRouter({
    routeTree: createRootRoute({ component: Board }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </IntlProvider>
  );
}

const column = (name: string) =>
  within(screen.getByRole("region", { name: new RegExp(`^${name}`) }));

/** Picks up a card by its handle, presses the keys, and drops it. */
async function moveWithKeys(title: string, keys: string[]) {
  const handle = await screen.findByRole("button", {
    name: `Move “${title}”`,
  });
  handle.focus();
  fireEvent.keyDown(handle, { code: "Space" });
  // The sensor listens for the next keys from the following tick.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  for (const code of keys) fireEvent.keyDown(document, { code });
  fireEvent.keyDown(document, { code: "Space" });
}

describe("RoadmapBoard", () => {
  it("shows each column with its cards, and no handles to visitors", async () => {
    fakeServer();
    renderBoard({ isTeam: false });
    // The router renders on the next tick.
    await screen.findByRole("region", { name: /^Planned/ });
    expect(column("Planned").getByText("Dark mode")).toBeTruthy();
    expect(column("In progress").getByText("Faster search")).toBeTruthy();
    expect(column("Shipped").getByText("Nothing here yet.")).toBeTruthy();
    expect(column("Shipped").getByText("Last 30 days")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Move/ })).toBeNull();
  });

  it("lets the team move a card a column over with the keyboard", async () => {
    const server = fakeServer();
    renderBoard({ isTeam: true });
    await moveWithKeys("Dark mode", ["ArrowRight"]);
    expect(await column("In progress").findByText("Dark mode")).toBeTruthy();
    expect(column("Planned").queryByText("Dark mode")).toBeNull();
    await waitFor(() =>
      expect(server.received).toEqual([{ id: 1, status: "in_progress" }])
    );
    expect(
      await screen.findByText("“Dark mode” moved to In progress.")
    ).toBeTruthy();
  });

  it("moves two columns over with two presses", async () => {
    const server = fakeServer();
    renderBoard({ isTeam: true });
    await moveWithKeys("Export", ["ArrowRight", "ArrowRight"]);
    expect(await column("Shipped").findByText("Export")).toBeTruthy();
    await waitFor(() =>
      expect(server.received).toEqual([{ id: 2, status: "shipped" }])
    );
  });

  it("puts the card back, with a toast, when the move fails", async () => {
    fakeServer({ failWrites: true });
    renderBoard({ isTeam: true });
    await moveWithKeys("Dark mode", ["ArrowRight"]);
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Something went wrong on our side. Try again."
      )
    );
    expect(await column("Planned").findByText("Dark mode")).toBeTruthy();
    expect(column("In progress").queryByText("Dark mode")).toBeNull();
  });

  it("sends nothing when a card is dropped where it was", async () => {
    const server = fakeServer();
    renderBoard({ isTeam: true });
    await moveWithKeys("Dark mode", []);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(server.received).toEqual([]);
    expect(column("Planned").getByText("Dark mode")).toBeTruthy();
  });
});
