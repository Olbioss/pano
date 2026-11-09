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
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import { DEMO_EMAIL_DOMAIN } from "@/shared/demo";
import { AccountPage } from "./account-page";

const auth = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  listPasskeys: vi.fn(),
  addPasskey: vi.fn(),
  deletePasskey: vi.fn(),
  changePassword: vi.fn(),
  linkSocial: vi.fn(),
  unlinkAccount: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    listAccounts: auth.listAccounts,
    changePassword: auth.changePassword,
    linkSocial: auth.linkSocial,
    unlinkAccount: auth.unlinkAccount,
    signOut: auth.signOut,
    passkey: {
      listUserPasskeys: auth.listPasskeys,
      addPasskey: auth.addPasskey,
      deletePasskey: auth.deletePasskey,
    },
  },
}));

const HOUR = 60 * 60 * 1000;
const ok = (data: unknown = {}) => ({ data, error: null });

type Setup = {
  email?: string;
  /** Hours since this session signed in. */
  sessionAge?: number;
  github?: boolean;
  accounts?: { id: string; providerId: string }[];
  passkeys?: { id: string; name: string | null; createdAt: string }[];
};

/** /api/me and the routes this page calls, as the case needs them. */
function fakeServer({
  email = "sam@studio.dev",
  sessionAge = 1,
  github = true,
  accounts = [],
  passkeys = [],
}: Setup = {}) {
  const posted: unknown[] = [];
  auth.listAccounts.mockResolvedValue(ok(accounts));
  auth.listPasskeys.mockResolvedValue(ok(passkeys));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const reply = (data: unknown) => Response.json({ success: true, data });
      if (url.pathname === "/api/me" && (init?.method ?? "GET") === "GET") {
        return reply({
          user: {
            id: "u1",
            name: "Sam",
            email,
            sessionStartedAt: new Date(
              Date.now() - sessionAge * HOUR
            ).toISOString(),
          },
          workspaces: [],
          signIn: { github },
        });
      }
      if (url.pathname === "/api/me/password") {
        posted.push(JSON.parse(String(init?.body)));
        return reply({ password: true });
      }
      return new Response("not faked", { status: 500 });
    })
  );
  return { posted };
}

async function renderAccount(error?: string) {
  const root = createRootRoute({ component: Outlet });
  const routeTree = root.addChildren([
    createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => <AccountPage error={error} />,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/signin",
      component: () => <p>Sign-in page</p>,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </IntlProvider>
  );
  await screen.findByRole("heading", { name: "Your account" });
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
  // jsdom has no WebAuthn; most cases act as a browser that has it.
  vi.stubGlobal("PublicKeyCredential", function PublicKeyCredential() {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountPage: password", () => {
  it("sets a first password for an account without one", async () => {
    const { posted } = fakeServer({ accounts: [] });
    await renderAccount();

    await screen.findByLabelText("New password");
    type("New password", "my first password");
    fireEvent.click(
      await screen.findByRole("button", { name: "Set a password" })
    );
    expect(await screen.findByText("Password set.")).toBeTruthy();
    expect(posted).toEqual([{ password: "my first password" }]);
  });

  it("changes a password, signing out the other devices", async () => {
    fakeServer({ accounts: [{ id: "a1", providerId: "credential" }] });
    auth.changePassword.mockResolvedValue(ok());
    await renderAccount();

    await screen.findByRole("button", { name: "Change password" });
    type("Current password", "old password!");
    type("New password", "a brand new password");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(
      await screen.findByText(
        "Password changed. Your other devices are signed out."
      )
    ).toBeTruthy();
    expect(auth.changePassword).toHaveBeenCalledWith({
      currentPassword: "old password!",
      newPassword: "a brand new password",
      revokeOtherSessions: true,
    });
  });

  it("says when the current password is wrong", async () => {
    fakeServer({ accounts: [{ id: "a1", providerId: "credential" }] });
    auth.changePassword.mockResolvedValue({
      data: null,
      error: { code: "INVALID_PASSWORD", status: 400 },
    });
    await renderAccount();
    await screen.findByRole("button", { name: "Change password" });
    type("Current password", "not it at all");
    type("New password", "a brand new password");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(
      await screen.findByText("Your current password isn't right.")
    ).toBeTruthy();
  });
});

describe("AccountPage: passkeys", () => {
  it("lists each passkey with its name and date, and removes one", async () => {
    fakeServer({
      passkeys: [
        {
          id: "pk1",
          name: "Safari on iPhone",
          createdAt: "2026-11-01T10:00:00Z",
        },
      ],
    });
    auth.deletePasskey.mockResolvedValue(ok());
    await renderAccount();

    expect(await screen.findByText("Safari on iPhone")).toBeTruthy();
    expect(screen.getByText("Added Nov 1, 2026")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(auth.deletePasskey).toHaveBeenCalledWith({ id: "pk1" })
    );
  });

  it("adds a passkey named after this browser", async () => {
    fakeServer();
    auth.addPasskey.mockResolvedValue(ok());
    await renderAccount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Add a passkey" })
    );
    await waitFor(() =>
      expect(auth.addPasskey).toHaveBeenCalledWith({ name: expect.any(String) })
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains the limit of 10", async () => {
    fakeServer();
    auth.addPasskey.mockResolvedValue({
      data: null,
      error: { code: "PASSKEY_LIMIT", status: 400 },
    });
    await renderAccount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Add a passkey" })
    );
    expect(
      await screen.findByText(/the most an account can have/)
    ).toBeTruthy();
  });

  it("says so in a browser that can't make passkeys", async () => {
    fakeServer();
    vi.stubGlobal("PublicKeyCredential", undefined);
    await renderAccount();
    expect(
      await screen.findByText("This browser can't make passkeys.")
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add a passkey" })).toBeNull();
  });
});

describe("AccountPage: GitHub", () => {
  it("connects GitHub, coming back to this page", async () => {
    fakeServer({ accounts: [] });
    await renderAccount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Connect GitHub" })
    );
    expect(auth.linkSocial).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: "/account",
      errorCallbackURL: "/account",
    });
  });

  it("disconnects GitHub by the account Better Auth listed", async () => {
    fakeServer({ accounts: [{ id: "acc-gh", providerId: "github" }] });
    auth.unlinkAccount.mockResolvedValue(ok());
    await renderAccount();
    expect(
      await screen.findByText("Connected: you can sign in with GitHub.")
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() =>
      expect(auth.unlinkAccount).toHaveBeenCalledWith({ accountId: "acc-gh" })
    );
  });

  it("leaves GitHub out when the server has no GitHub secrets", async () => {
    fakeServer({ github: false });
    await renderAccount();
    await screen.findByRole("heading", { name: "Passkeys" });
    expect(screen.queryByRole("heading", { name: "GitHub" })).toBeNull();
  });

  it("explains why connecting GitHub came back refused", async () => {
    fakeServer();
    await renderAccount("account_not_linked");
    expect(await screen.findByText(/can't join yet/)).toBeTruthy();
  });
});

describe("AccountPage: who may change what", () => {
  it("asks for a fresh sign-in before adding a way to sign in", async () => {
    fakeServer({ sessionAge: 25, accounts: [] });
    auth.signOut.mockResolvedValue(ok());
    await renderAccount();

    await screen.findByRole("heading", { name: "Passkeys" });
    expect(screen.queryByRole("button", { name: "Add a passkey" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Connect GitHub" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Set a password" })).toBeNull();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Sign in again" })[0]!
    );
    expect(await screen.findByText("Sign-in page")).toBeTruthy();
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("shows demo guests a note and no controls", async () => {
    fakeServer({ email: `guest-1@${DEMO_EMAIL_DOMAIN}` });
    await renderAccount();
    expect(
      await screen.findByText(/Demo accounts can't add ways to sign in/)
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
