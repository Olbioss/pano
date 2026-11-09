import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { account, session, user } from "../db/schema";
import { resetDemo } from "../services/demo-reset";
import { testApp, uniqueEmail, updateCookie } from "../test/app";
import { testDb } from "../test/db";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());
afterEach(() => vi.unstubAllGlobals());

const GITHUB = {
  GITHUB_CLIENT_ID: "test-id",
  GITHUB_CLIENT_SECRET: "test-secret",
};

type GitHubUser = {
  email: string;
  verified?: boolean;
  name?: string | null;
  login?: string;
};

/** Stands in for GitHub's token, user and email endpoints. */
function stubGitHub({
  email,
  verified = true,
  name = "Mona Lisa",
  login = "octocat",
}: GitHubUser) {
  const id = Math.floor(Math.random() * 1e9);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return Response.json({
          access_token: "gho_test",
          token_type: "bearer",
          scope: "read:user,user:email",
        });
      }
      if (url === "https://api.github.com/user") {
        return Response.json({ id, login, name, email: null, avatar_url: "" });
      }
      if (url === "https://api.github.com/user/emails") {
        return Response.json([{ email, primary: true, verified }]);
      }
      return new Response("not stubbed", { status: 500 });
    })
  );
}

/**
 * Runs GitHub's round trip: Pano's redirect to GitHub, then GitHub's
 * redirect back. Returns where Pano sent the browser, and its cookies.
 */
async function viaGitHub(
  t: ReturnType<typeof testApp>,
  start: { path: string; body: Record<string, unknown> },
  cookie = ""
) {
  const started = await t.post(
    start.path,
    start.body,
    cookie ? { cookie } : {}
  );
  if (!started.ok) return { started, location: null, cookie };
  const { url } = (await started.json()) as { url: string };
  const state = new URL(url).searchParams.get("state");
  const jar = updateCookie(cookie, started);
  const back = await t.request(
    `/api/auth/callback/github?code=test-code&state=${state}`,
    { headers: { cookie: jar } }
  );
  return {
    started,
    location: back.headers.get("location"),
    cookie: updateCookie(jar, back),
  };
}

const signInWithGitHub = (t: ReturnType<typeof testApp>) =>
  viaGitHub(t, {
    path: "/api/auth/sign-in/social",
    body: { provider: "github", callbackURL: "/", errorCallbackURL: "/signin" },
  });

const connectGitHub = (t: ReturnType<typeof testApp>, cookie: string) =>
  viaGitHub(
    t,
    {
      path: "/api/auth/link-social",
      body: {
        provider: "github",
        callbackURL: "/account",
        errorCallbackURL: "/account",
      },
    },
    cookie
  );

async function me(t: ReturnType<typeof testApp>, cookie: string) {
  const res = await t.client.api.me.$get(undefined, { headers: { cookie } });
  const body = await res.json();
  return body.success ? body.data.user : null;
}

async function providers(userId: string) {
  const rows = await db
    .select({ provider: account.providerId })
    .from(account)
    .where(eq(account.userId, userId));
  return rows.map((row) => row.provider).sort();
}

describe("signing in with GitHub", () => {
  it("makes an account named after the GitHub profile", async () => {
    const t = testApp(GITHUB);
    const email = uniqueEmail("mona");
    stubGitHub({ email });

    const { location, cookie } = await signInWithGitHub(t);
    expect(location).toBe("/");
    expect(await me(t, cookie)).toMatchObject({ email, name: "Mona Lisa" });
    await t.settle();
  });

  it("uses the login when the profile has no name", async () => {
    const t = testApp(GITHUB);
    stubGitHub({ email: uniqueEmail(), name: null, login: "octocat" });
    const { cookie } = await signInWithGitHub(t);
    expect(await me(t, cookie)).toMatchObject({ name: "octocat" });
    await t.settle();
  });

  it("joins the account that has the same, verified email", async () => {
    const t = testApp(GITHUB);
    const { email, cookie: codeCookie } = await t.signIn();
    const owner = await me(t, codeCookie);
    stubGitHub({ email });

    const { cookie } = await signInWithGitHub(t);
    expect(await me(t, cookie)).toMatchObject({ id: owner?.id });
    expect(await providers(owner!.id)).toEqual(["github"]);
    await t.settle();
  });

  it("refuses a GitHub account whose email GitHub hasn't verified", async () => {
    const t = testApp(GITHUB);
    const email = uniqueEmail();
    stubGitHub({ email, verified: false });

    const { location } = await signInWithGitHub(t);
    expect(location).toMatch(/^\/signin\?error=/);
    expect(await db.select().from(user).where(eq(user.email, email))).toEqual(
      []
    );
    await t.settle();
  });

  it("won't join an unconfirmed sign-up, so its password never gains a GitHub link", async () => {
    const t = testApp(GITHUB);
    const email = uniqueEmail();
    await t.signUp(email, "someone else's password");
    stubGitHub({ email });

    const { location } = await signInWithGitHub(t);
    expect(location).toMatch(/^\/signin\?error=account_not_linked/);
    await t.settle();
  });

  it("isn't offered without GitHub's secrets", async () => {
    const t = testApp();
    const res = await t.post("/api/auth/sign-in/social", {
      provider: "github",
      callbackURL: "/",
    });
    expect(res.ok).toBe(false);
    await t.settle();
  });
});

describe("connecting GitHub from the account page", () => {
  it("links GitHub to the signed-in account, even with another address", async () => {
    const t = testApp(GITHUB);
    const { cookie } = await t.signIn();
    const owner = await me(t, cookie);
    stubGitHub({ email: uniqueEmail("elsewhere") });

    const { location } = await connectGitHub(t, cookie);
    expect(location).toBe("/account");
    expect(await providers(owner!.id)).toEqual(["github"]);
    await t.settle();
  });

  it("needs a session that signed in within the last day", async () => {
    const t = testApp(GITHUB);
    const { email, cookie } = await t.signIn();
    const [owner] = await db.select().from(user).where(eq(user.email, email));
    await db
      .update(session)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(session.userId, owner!.id));
    const tokenOnly = cookie
      .split("; ")
      .filter((part) => part.startsWith("better-auth.session_token="))
      .join("; ");

    const { started } = await connectGitHub(t, tokenOnly);
    expect(started.status).toBe(403);
    expect(await started.json()).toMatchObject({ code: "SESSION_NOT_FRESH" });
    await t.settle();
  });

  it("refuses demo guests", async () => {
    const t = testApp(GITHUB);
    const { cookie } = await t.signInDemo("member");
    const { started } = await connectGitHub(t, cookie);
    expect(started.status).toBe(403);
    expect(await started.json()).toMatchObject({ code: "DEMO_ONLY" });
    await t.settle();
  });

  it("lets an account made with GitHub disconnect it: email codes still work", async () => {
    const t = testApp(GITHUB);
    const email = uniqueEmail();
    stubGitHub({ email });
    const { cookie } = await signInWithGitHub(t);
    const owner = await me(t, cookie);

    // The account page lists sign-ins through Better Auth, and disconnects
    // one by the id it lists.
    const listed = await t.request("/api/auth/list-accounts", {
      headers: { cookie },
    });
    const linked = (await listed.json()) as {
      id: string;
      providerId: string;
    }[];
    const github = linked.find((row) => row.providerId === "github");
    const res = await t.post(
      "/api/auth/unlink-account",
      { accountId: github?.id },
      { cookie }
    );
    expect(res.status).toBe(200);
    expect(await providers(owner!.id)).toEqual([]);
    expect((await t.signIn(email)).cookie).not.toBe("");
    await t.settle();
  });
});
