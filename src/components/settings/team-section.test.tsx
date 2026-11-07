// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
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
import { meQueryOptions } from "@/lib/session";
import type { PendingInvitation, TeamView } from "@/shared/team";
import { TeamSection } from "./team-section";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NOW = new Date("2026-10-30T12:00:00Z");

const waiting = (email: string): PendingInvitation => ({
  id: `inv-${email}`,
  email,
  role: "member",
  expiresAt: "2026-11-06T12:00:00Z",
  invitedBy: "Olbios",
});

const startingTeam = (): TeamView => ({
  members: [
    {
      userId: "u-owner",
      name: "Olbios",
      email: "owner@example.com",
      role: "owner",
      joinedAt: "2026-10-01T00:00:00Z",
    },
    {
      userId: "u-defne",
      name: "Defne",
      email: "defne@example.com",
      role: "admin",
      joinedAt: "2026-10-02T00:00:00Z",
    },
    {
      userId: "u-jonas",
      name: "Jonas",
      email: "jonas@example.com",
      role: "member",
      joinedAt: "2026-10-03T00:00:00Z",
    },
  ],
  invitations: [waiting("sam@studio.dev")],
});

/** The team's API, keeping changes; `received` records each write. */
function fakeServer({
  emailSent = true,
  refuse,
}: {
  emailSent?: boolean;
  refuse?: string;
} = {}) {
  const state = {
    team: startingTeam(),
    received: [] as { method: string; path: string; body?: unknown }[],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (method !== "GET")
        state.received.push({ method, path: url.pathname, body });
      const ok = (data: unknown, status = 200) =>
        Response.json({ success: true, data }, { status });
      const path = url.pathname;
      if (path === "/api/workspaces/acme/team") return ok(state.team);
      if (path === "/api/me") return ok({ user: null, workspaces: [] });
      if (refuse) {
        return Response.json(
          { success: false, code: refuse, error: "refused" },
          { status: 409 }
        );
      }
      if (path === "/api/workspaces/acme/invitations" && method === "POST") {
        const invitation = waiting(body.email);
        state.team.invitations.push(invitation);
        return ok({ invitation, emailSent }, 201);
      }
      const resend =
        /^\/api\/workspaces\/acme\/invitations\/(.+)\/resend$/.exec(path);
      if (resend) {
        const invitation = state.team.invitations.find(
          (i) => i.id === resend[1]
        );
        return ok({ invitation, emailSent: true });
      }
      const invitation = /^\/api\/workspaces\/acme\/invitations\/(.+)$/.exec(
        path
      );
      if (invitation && method === "DELETE") {
        state.team.invitations = state.team.invitations.filter(
          (i) => i.id !== invitation[1]
        );
        return ok({ id: invitation[1] });
      }
      const member = /^\/api\/workspaces\/acme\/members\/(.+)$/.exec(path);
      if (member && method === "PATCH") {
        state.team.members = state.team.members.map((m) =>
          m.userId === member[1] ? { ...m, role: body.role } : m
        );
        return ok(state.team);
      }
      if (member && method === "DELETE") {
        state.team.members = state.team.members.filter(
          (m) => m.userId !== member[1]
        );
        return ok({ userId: member[1] });
      }
      return Response.json(
        { success: false, code: "NOT_FOUND", error: "Not found" },
        { status: 404 }
      );
    })
  );
  return state;
}

async function renderTeam(viewer: { id: string; role: string }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <TeamSection
          slug="acme"
          viewerId={viewer.id}
          viewerRole={viewer.role}
        />
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC" now={NOW}>
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </IntlProvider>
  );
  await screen.findByRole("heading", { name: "Members" });
  return qc;
}

const memberRow = (name: string) =>
  within(
    screen
      .getAllByRole("listitem")
      .find((row) => row.textContent?.includes(name)) as HTMLElement
  );

describe("TeamSection", () => {
  it("shows when each person joined", async () => {
    fakeServer();
    await renderTeam({ id: "u-owner", role: "owner" });
    expect(memberRow("Defne").getByText("joined October 2, 2026")).toBeTruthy();
  });

  it("refreshes who you are when you change your own role, and only then", async () => {
    fakeServer();
    const qc = await renderTeam({ id: "u-defne", role: "admin" });
    const me = { user: { id: "u-defne" }, workspaces: [] };
    qc.setQueryData(meQueryOptions.queryKey, me as never);
    const meInvalidated = () =>
      qc.getQueryState(meQueryOptions.queryKey)?.isInvalidated;

    fireEvent.change(screen.getByLabelText("Role for Jonas"), {
      target: { value: "admin" },
    });
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Role for Jonas") as HTMLSelectElement).value
      ).toBe("admin")
    );
    expect(meInvalidated()).toBe(false);

    fireEvent.change(screen.getByLabelText("Role for Defne"), {
      target: { value: "member" },
    });
    await waitFor(() => expect(meInvalidated()).toBe(true));
  });

  it("gives owners the invite form and every control but the owner's", async () => {
    fakeServer();
    await renderTeam({ id: "u-owner", role: "owner" });
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Send invitation" })
    ).toBeTruthy();
    expect(memberRow("Olbios (you)").getByText("Owner")).toBeTruthy();
    expect(memberRow("Olbios (you)").queryByRole("button")).toBeNull();
    expect(
      (screen.getByLabelText("Role for Defne") as HTMLSelectElement).value
    ).toBe("admin");
    expect(
      screen.getByRole("button", { name: "Remove Jonas from the team" })
    ).toBeTruthy();
    expect(screen.getByText("Member · expires November 6")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Send the invitation to sam@studio.dev again",
      })
    ).toBeTruthy();
  });

  it("shows members the team without controls, and lets them leave", async () => {
    fakeServer();
    await renderTeam({ id: "u-jonas", role: "member" });
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(memberRow("Defne").getByText("Admin")).toBeTruthy();
    expect(memberRow("Defne").queryByRole("button")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /invitation to sam/ })
    ).toBeNull();
    expect(
      memberRow("Jonas (you)").getByRole("button", { name: "Leave team" })
    ).toBeTruthy();
  });

  it("invites an address and says so", async () => {
    const server = fakeServer();
    await renderTeam({ id: "u-owner", role: "owner" });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: " ada@example.com " },
    });
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "admin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(
      await screen.findByText("Invitation sent to ada@example.com.")
    ).toBeTruthy();
    expect(server.received).toEqual([
      {
        method: "POST",
        path: "/api/workspaces/acme/invitations",
        body: { email: "ada@example.com", role: "admin" },
      },
    ]);
    expect(await screen.findByText("ada@example.com")).toBeTruthy();
  });

  it("says when an invitation's email didn't go out", async () => {
    fakeServer({ emailSent: false });
    await renderTeam({ id: "u-owner", role: "owner" });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The invitation to ada@example.com is saved, but its email didn't go out. Try Resend."
    );
  });

  it("says why an invitation was refused", async () => {
    fakeServer({ refuse: "ALREADY_ON_TEAM" });
    await renderTeam({ id: "u-owner", role: "owner" });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "jonas@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "That person is already on the team."
    );
  });

  it("changes a role, and removes someone after a second click", async () => {
    const server = fakeServer();
    await renderTeam({ id: "u-owner", role: "owner" });
    fireEvent.change(screen.getByLabelText("Role for Defne"), {
      target: { value: "member" },
    });
    await waitFor(() =>
      expect(server.received).toContainEqual({
        method: "PATCH",
        path: "/api/workspaces/acme/members/u-defne",
        body: { role: "member" },
      })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Jonas from the team" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    await waitFor(() => expect(screen.queryByText("Jonas")).toBeNull());
    expect(server.received).toContainEqual({
      method: "DELETE",
      path: "/api/workspaces/acme/members/u-jonas",
    });
  });

  it("sends an invitation again, and cancels it", async () => {
    const server = fakeServer();
    await renderTeam({ id: "u-owner", role: "owner" });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Send the invitation to sam@studio.dev again",
      })
    );
    expect(
      await screen.findByText("Invitation sent to sam@studio.dev again.")
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Cancel the invitation to sam@studio.dev",
      })
    );
    await waitFor(() =>
      expect(screen.queryByText("sam@studio.dev")).toBeNull()
    );
    expect(server.received.map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /api/workspaces/acme/invitations/inv-sam@studio.dev/resend",
      "DELETE /api/workspaces/acme/invitations/inv-sam@studio.dev",
    ]);
  });
});
