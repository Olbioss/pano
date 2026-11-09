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
import type { ReactNode } from "react";
import { IntlProvider } from "use-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import { ForgotPasswordPage } from "./forgot-password-page";
import { SignInPage } from "./sign-in-page";
import { SignUpPage } from "./sign-up-page";

// Better Auth's client keeps its own fetch: each test says what it answers.
const auth = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  fetch: vi.fn(),
  requestReset: vi.fn(),
  resetPassword: vi.fn(),
  signInPasskey: vi.fn(),
  signInSocial: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: auth.signInEmail,
      passkey: auth.signInPasskey,
      social: auth.signInSocial,
      emailOtp: vi.fn(),
    },
    signUp: { email: auth.signUpEmail },
    $fetch: auth.fetch,
    emailOtp: {
      requestPasswordReset: auth.requestReset,
      resetPassword: auth.resetPassword,
      sendVerificationOtp: vi.fn(),
    },
  },
}));

const ok = { data: {}, error: null };
const refused = (code: string, status = 400) => ({
  data: null,
  error: { code, status, message: "refused" },
});

/** /api/me: signed out until a sign-in succeeds, and whether GitHub is on. */
function fakeMe({ github = false } = {}) {
  const state = { signedIn: false };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/me") {
        return Response.json({
          success: true,
          data: {
            user: state.signedIn
              ? {
                  id: "u1",
                  name: "",
                  email: "sam@studio.dev",
                  sessionStartedAt: new Date().toISOString(),
                }
              : null,
            workspaces: [],
            signIn: { github },
          },
        });
      }
      return new Response("not faked", { status: 500 });
    })
  );
  return state;
}

/** Renders the page and waits for the router to show it. */
async function renderPage(page: ReactNode) {
  const root = createRootRoute({ component: Outlet });
  const routeTree = root.addChildren([
    createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => page,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/new-workspace",
      component: () => <p>New workspace page</p>,
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
  await screen.findByRole("heading", { level: 1 });
}

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
  auth.signInPasskey.mockResolvedValue(refused("AUTH_CANCELLED"));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SignInPage", () => {
  it("signs in with a password, then goes on to make a workspace", async () => {
    const me = fakeMe();
    auth.signInEmail.mockImplementation(async () => {
      me.signedIn = true;
      return ok;
    });
    await renderPage(<SignInPage />);

    type("Email", "sam@studio.dev");
    type("Password", "correct horse battery");
    press("Sign in");

    expect(await screen.findByText("New workspace page")).toBeTruthy();
    expect(auth.signInEmail).toHaveBeenCalledWith({
      email: "sam@studio.dev",
      password: "correct horse battery",
    });
  });

  it("says when the email and password don't match", async () => {
    fakeMe();
    auth.signInEmail.mockResolvedValue(
      refused("INVALID_EMAIL_OR_PASSWORD", 401)
    );
    await renderPage(<SignInPage />);
    type("Email", "sam@studio.dev");
    type("Password", "not it");
    press("Sign in");
    expect(
      await screen.findByText("That email and password don't match.")
    ).toBeTruthy();
  });

  it("confirms an unconfirmed account, sending the password along with the code", async () => {
    const me = fakeMe();
    auth.signInEmail.mockResolvedValue(refused("EMAIL_NOT_VERIFIED", 403));
    auth.signUpEmail.mockResolvedValue(ok);
    auth.fetch.mockImplementation(async () => {
      me.signedIn = true;
      return ok;
    });
    await renderPage(<SignInPage />);

    type("Email", "sam@studio.dev");
    type("Password", "correct horse battery");
    press("Sign in");
    fireEvent.click(
      await screen.findByRole("button", { name: "Send a new code" })
    );

    expect(
      await screen.findByText(/We sent a code to sam@studio.dev/)
    ).toBeTruthy();
    expect(auth.signUpEmail).toHaveBeenCalledWith({
      email: "sam@studio.dev",
      password: "correct horse battery",
      name: "",
    });
    type("6-digit code", "123456");
    press("Confirm");

    expect(await screen.findByText("New workspace page")).toBeTruthy();
    expect(auth.fetch).toHaveBeenCalledWith("/email-otp/verify-email", {
      method: "POST",
      body: {
        email: "sam@studio.dev",
        otp: "123456",
        password: "correct horse battery",
      },
    });
  });

  it("switches to an emailed code", async () => {
    fakeMe();
    await renderPage(<SignInPage />);
    press("Email me a code instead");
    expect(
      await screen.findByRole("button", { name: "Send code" })
    ).toBeTruthy();
  });

  it("offers GitHub only when the server has it, and comes back here", async () => {
    fakeMe({ github: true });
    await renderPage(<SignInPage redirect="/acme" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue with GitHub" })
    );
    expect(auth.signInSocial).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: "/signin?redirect=%2Facme",
      errorCallbackURL: "/signin",
    });
  });

  it("has no GitHub button when the server has no GitHub secrets", async () => {
    fakeMe({ github: false });
    await renderPage(<SignInPage />);
    await screen.findByRole("button", { name: "Sign in with a passkey" });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Continue with GitHub" })
      ).toBeNull()
    );
  });

  it("explains why GitHub sign-in came back refused", async () => {
    fakeMe();
    await renderPage(<SignInPage error="github_email_unverified" />);
    expect(
      await screen.findByText(/GitHub hasn't verified this account's email/)
    ).toBeTruthy();
  });

  it("says nothing when the passkey prompt is closed, and explains a failure", async () => {
    fakeMe();
    await renderPage(<SignInPage />);
    press("Sign in with a passkey");
    await waitFor(() => expect(auth.signInPasskey).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();

    auth.signInPasskey.mockResolvedValue(refused("SOMETHING_ELSE"));
    press("Sign in with a passkey");
    expect(await screen.findByText(/That passkey didn't work/)).toBeTruthy();
  });
});

describe("SignUpPage", () => {
  it("makes the account, then confirms it with the code and the password", async () => {
    const me = fakeMe();
    auth.signUpEmail.mockResolvedValue(ok);
    auth.fetch.mockImplementation(async () => {
      me.signedIn = true;
      return ok;
    });
    await renderPage(<SignUpPage />);

    type("Email", "sam@studio.dev");
    type("Password", "correct horse battery");
    press("Create account");
    await screen.findByLabelText("6-digit code");
    type("6-digit code", "654321");
    press("Confirm");

    expect(await screen.findByText("New workspace page")).toBeTruthy();
    expect(auth.fetch).toHaveBeenCalledWith(
      "/email-otp/verify-email",
      expect.objectContaining({
        body: {
          email: "sam@studio.dev",
          otp: "654321",
          password: "correct horse battery",
        },
      })
    );
  });

  it("refuses a password shorter than 8 characters before asking the server", async () => {
    fakeMe();
    await renderPage(<SignUpPage />);
    type("Email", "sam@studio.dev");
    type("Password", "short");
    press("Create account");
    await screen.findByRole("button", { name: "Create account" });
    await waitFor(() => expect(auth.signUpEmail).not.toHaveBeenCalled());
  });

  it("explains a leaked password", async () => {
    fakeMe();
    auth.signUpEmail.mockResolvedValue(refused("PASSWORD_COMPROMISED"));
    await renderPage(<SignUpPage />);
    type("Email", "sam@studio.dev");
    type("Password", "password1234");
    press("Create account");
    expect(
      await screen.findByText(/appears in a known data breach/)
    ).toBeTruthy();
  });
});

describe("ForgotPasswordPage", () => {
  it("emails a code, sets the new password, then signs in with it", async () => {
    const me = fakeMe();
    auth.requestReset.mockResolvedValue(ok);
    auth.resetPassword.mockResolvedValue(ok);
    auth.signInEmail.mockImplementation(async () => {
      me.signedIn = true;
      return ok;
    });
    await renderPage(<ForgotPasswordPage />);

    type("Email", "sam@studio.dev");
    press("Send code");
    expect(
      await screen.findByText(/If sam@studio.dev has a Pano account/)
    ).toBeTruthy();
    type("6-digit code", "111222");
    type("New password", "a brand new password");
    press("Set new password");

    expect(await screen.findByText("New workspace page")).toBeTruthy();
    expect(auth.resetPassword).toHaveBeenCalledWith({
      email: "sam@studio.dev",
      otp: "111222",
      password: "a brand new password",
    });
    expect(auth.signInEmail).toHaveBeenCalledWith({
      email: "sam@studio.dev",
      password: "a brand new password",
    });
  });
});
