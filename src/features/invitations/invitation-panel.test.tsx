// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import { meQueryOptions } from "@/lib/session";
import type { InvitationView } from "@/shared/invitations";
import { InvitationPanel } from "./invitation-panel";

const session = vi.hoisted(() => ({ signedIn: true }));
// Better Auth's client keeps its own fetch; sign out here instead.
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: vi.fn(async () => {
      session.signedIn = false;
      return { data: { success: true }, error: null };
    }),
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  session.signedIn = true;
});

const view = (overrides: Partial<InvitationView> = {}): InvitationView => ({
  id: "inv-1",
  workspace: { name: "Acme", slug: "acme" },
  inviter: "Defne",
  role: "member",
  email: "s•••@studio.dev",
  state: "pending",
  forYou: true,
  onTeam: false,
  ...overrides,
});

/** The invitation's API, and who's signed in. */
function fakeServer(
  invitation: InvitationView | null,
  { refuse }: { refuse?: string } = {}
) {
  const accepted: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const ok = (data: unknown) => Response.json({ success: true, data });
      if (url.pathname === "/api/me") {
        return ok(
          session.signedIn
            ? {
                user: { id: "u-sam", name: "", email: "sam@studio.dev" },
                workspaces: [],
              }
            : { user: null, workspaces: [] }
        );
      }
      if (url.pathname === "/api/invitations/inv-1" && invitation) {
        return ok(invitation);
      }
      if (url.pathname === "/api/invitations/inv-1/accept") {
        accepted.push(init?.method ?? "GET");
        if (refuse) {
          return Response.json(
            { success: false, code: refuse, error: "refused" },
            { status: 409 }
          );
        }
        return ok({ slug: "acme" });
      }
      return Response.json(
        { success: false, code: "INVITATION_NOT_FOUND", error: "Not found" },
        { status: 404 }
      );
    })
  );
  return { accepted };
}

function renderPanel() {
  const root = createRootRoute({ component: Outlet });
  const routeTree = root.addChildren([
    createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => <InvitationPanel id="inv-1" />,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/$ws",
      component: () => <p>Workspace page</p>,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </IntlProvider>
  );
  return queryClient;
}

describe("InvitationPanel", () => {
  it("asks someone signed out to sign in with the invited address", async () => {
    session.signedIn = false;
    fakeServer(view({ forYou: false }));
    renderPanel();
    expect(
      await screen.findByRole("heading", {
        name: "Defne invited you to Acme's team",
      })
    ).toBeTruthy();
    expect(
      screen.getByText(
        "You'd join as a member. The invitation went to s•••@studio.dev."
      )
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Sign in to join" }).getAttribute("href")
    ).toBe("/signin?redirect=%2Finvite%2Finv-1");
  });

  it("joins the team and opens the workspace", async () => {
    const server = fakeServer(view());
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Join Acme" }));
    expect(await screen.findByText("Workspace page")).toBeTruthy();
    expect(server.accepted).toEqual(["POST"]);
  });

  it("says why joining was refused", async () => {
    fakeServer(view(), { refuse: "TEAM_FULL" });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Join Acme" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The team is full: a workspace can have 50 people."
    );
  });

  it("offers to sign out when another address is signed in", async () => {
    fakeServer(view({ forYou: false }));
    renderPanel();
    expect(
      await screen.findByText(
        "This invitation went to s•••@studio.dev. Sign out, then sign in with that address."
      )
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Join Acme" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByRole("link", { name: "Sign in to join" })
    ).toBeTruthy();
  });

  it("never shows someone who just signed in the answer they got signed out", async () => {
    session.signedIn = false;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://localhost");
        const ok = (data: unknown) => Response.json({ success: true, data });
        if (url.pathname === "/api/me") {
          return ok({
            user: session.signedIn
              ? { id: "u-sam", name: "", email: "sam@studio.dev" }
              : null,
            workspaces: [],
          });
        }
        // Signed out it can't be for you; signed in as Sam it is, slowly.
        if (session.signedIn) await held;
        return ok(view({ forYou: session.signedIn }));
      })
    );
    const queryClient = renderPanel();
    expect(
      await screen.findByRole("link", { name: "Sign in to join" })
    ).toBeTruthy();

    session.signedIn = true;
    await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
    expect(await screen.findByText("Loading the invitation…")).toBeTruthy();
    expect(screen.queryByText(/This invitation went to/)).toBeNull();
    release();
    expect(
      await screen.findByRole("button", { name: "Join Acme" })
    ).toBeTruthy();
  });

  it("still shows the invitation when Pano can't tell who's signed in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname === "/api/me") {
          return Response.json(
            { success: false, code: "INTERNAL_ERROR", error: "down" },
            { status: 500 }
          );
        }
        return Response.json({ success: true, data: view({ forYou: false }) });
      })
    );
    renderPanel();
    expect(
      await screen.findByRole("link", { name: "Sign in to join" })
    ).toBeTruthy();
  });

  it("says when an invitation has expired, or was used or cancelled", async () => {
    fakeServer(view({ state: "expired" }));
    renderPanel();
    expect(
      await screen.findByText(
        "This invitation has expired. Ask whoever invited you to send it again."
      )
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Join Acme" })).toBeNull();
    cleanup();
    fakeServer(view({ state: "canceled" }));
    renderPanel();
    expect(
      await screen.findByText(
        "This invitation isn't open any more: it was cancelled or already used."
      )
    ).toBeTruthy();
  });

  it("points someone already on the team at the workspace", async () => {
    fakeServer(view({ onTeam: true }));
    renderPanel();
    expect(await screen.findByText("You're on Acme's team.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open Acme" }).getAttribute("href")
    ).toBe("/acme");
  });

  it("says when there's no such invitation", async () => {
    fakeServer(null);
    renderPanel();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This invitation isn't open any more: it was cancelled or already used."
    );
  });
});
