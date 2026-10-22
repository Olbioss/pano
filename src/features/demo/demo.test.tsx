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

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { error: toastError },
  Toaster: () => null,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastError.mockReset();
});

const guest = {
  id: "g1",
  name: "Guest 4821",
  email: "guest-1f2e@demo.pano.invalid",
};
const demoWorkspace = {
  id: "org_pano_demo",
  slug: "demo",
  name: "Inkwell",
  defaultLocale: "en",
  isDemo: true,
  boards: [{ id: "b1", slug: "features", name: "Features", position: 0 }],
};

/**
 * The API behind the landing page and the demo workspace. Signing in to the
 * demo makes later /api/me answers the guest's.
 */
function fakeServer({
  signedIn = false,
  as = guest,
  demoStatus = 200,
}: {
  signedIn?: boolean;
  as?: typeof guest;
  demoStatus?: number;
} = {}) {
  const demoSignIns: unknown[] = [];
  let user: typeof guest | null = signedIn ? as : null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request?.url ?? String(input), "http://localhost");
      const method = init?.method ?? request?.method ?? "GET";
      const ok = (data: unknown) => Response.json({ success: true, data });
      if (url.pathname === "/api/auth/demo/sign-in" && method === "POST") {
        demoSignIns.push(
          JSON.parse(String(init?.body ?? (await request?.text())))
        );
        if (demoStatus !== 200) {
          return Response.json({ message: "no" }, { status: demoStatus });
        }
        user = guest;
        return Response.json({ name: guest.name, team: true });
      }
      if (url.pathname === "/api/me") {
        const workspace =
          user === guest
            ? { id: "org_pano_demo", slug: "demo", name: "Inkwell" }
            : { id: "org_acme", slug: "acme", name: "Acme" };
        return ok({
          user,
          workspaces: user ? [{ ...workspace, role: "member" }] : [],
        });
      }
      if (url.pathname === "/api/workspaces/demo") return ok(demoWorkspace);
      if (url.pathname === "/api/workspaces/demo/roadmap") {
        return ok({ planned: [], in_progress: [], shipped: [] });
      }
      if (url.pathname === "/api/workspaces/demo/posts") {
        return ok({ items: [], page: 1, hasMore: false });
      }
      return Response.json(
        { success: false, code: "NOT_FOUND", error: "Not found" },
        { status: 404 }
      );
    })
  );
  return demoSignIns;
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

describe("trying the demo", () => {
  it("signs in to a guest account and opens the demo's roadmap", async () => {
    const demoSignIns = fakeServer();
    const router = renderAt("/");
    fireEvent.click(await screen.findByRole("button", { name: "Try as team" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/demo/roadmap")
    );
    expect(demoSignIns).toEqual([{ as: "team" }]);
    // The header shows the guest's name, never the made-up address.
    expect(await screen.findByText("Guest 4821")).toBeTruthy();
    expect(screen.getByText("Demo")).toBeTruthy();
    expect(screen.queryByText(guest.email)).toBeNull();
  });

  it("says so when one address started too many demos", async () => {
    fakeServer({ demoStatus: 429 });
    const router = renderAt("/");
    fireEvent.click(
      await screen.findByRole("button", { name: "Try as member" })
    );
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Too many demo sign-ins from here. Wait a minute and try again."
      )
    );
    expect(router.state.location.pathname).toBe("/");
    expect(
      screen.getByRole("button", { name: "Try as member" }).matches(":disabled")
    ).toBe(false);
  });

  it("offers the two ways in on the demo's pages to visitors who aren't signed in", async () => {
    fakeServer();
    renderAt("/demo");
    const banner = await screen.findByRole("complementary", {
      name: "About this demo",
    });
    expect(banner.textContent).toContain("resets at 01:00 UTC");
    expect(
      await screen.findByRole("button", { name: "Try as team" })
    ).toBeTruthy();
  });

  it("shows the demo's settings as read-only to its team", async () => {
    fakeServer({ signedIn: true });
    renderAt("/demo/settings");
    expect(await screen.findByText(/they stay as they are/)).toBeTruthy();
    // A disabled fieldset disables every field inside it.
    expect(screen.getByLabelText("Name").matches(":disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Try as team" })).toBeNull();
  });

  it("keeps the demo buttons from someone signed in with a real account", async () => {
    fakeServer({
      signedIn: true,
      as: { id: "u1", name: "Ayşe", email: "ayse@example.com" },
    });
    renderAt("/");
    expect(await screen.findByRole("link", { name: "Open Acme" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try as team" })).toBeNull();
  });
});
