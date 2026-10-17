import { afterAll, describe, expect, it } from "vitest";
import { boards, organization, posts } from "./db/schema";
import { escapeAttribute, postMeta, renderPostPage } from "./og";
import { testDb } from "./test/db";

describe("postMeta", () => {
  const post = {
    id: 12,
    title: "Dark mode",
    body: "Please add a **dark** theme for night use.",
    workspaceName: "Acme",
  };

  it("titles the page with the post and its workspace", () => {
    expect(postMeta(post).title).toBe("Dark mode · Acme");
  });

  it("describes it with the start of the body", () => {
    expect(postMeta(post).description).toBe(
      "Please add a dark theme for night use."
    );
  });

  it("falls back to the workspace when the body is empty", () => {
    expect(postMeta({ ...post, body: "" }).description).toBe(
      "A request on Acme's board"
    );
  });

  it("points at the post's current address", () => {
    expect(postMeta(post).canonicalPath).toBe("/p/12-dark-mode");
  });
});

describe("escapeAttribute", () => {
  it("escapes what could end an attribute or start a tag", () => {
    expect(escapeAttribute(`a&b"c<d>e`)).toBe("a&amp;b&quot;c&lt;d&gt;e");
  });
});

describe("renderPostPage", () => {
  const { db, close } = testDb();
  const pending: Promise<unknown>[] = [];
  afterAll(async () => {
    await Promise.allSettled(pending);
    await close();
  });

  // Enough of the Worker's env for the answers that come before HTMLRewriter.
  const env = {
    ASSETS: {
      fetch: async () =>
        new Response("<!doctype html><title>Pano</title>", {
          headers: { "content-type": "text/html" },
        }),
    },
    HYPERDRIVE: { connectionString: String(process.env.TEST_DATABASE_URL) },
  } as unknown as Env;
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    },
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;

  async function postTitled(title: string) {
    const orgId = crypto.randomUUID();
    await db.insert(organization).values({
      id: orgId,
      name: "Acme",
      slug: `og-${orgId.slice(0, 8)}`,
      createdAt: new Date(),
    });
    const [board] = await db
      .insert(boards)
      .values({ organizationId: orgId, slug: "ideas", name: "Ideas" })
      .returning({ id: boards.id });
    const [post] = await db
      .insert(posts)
      .values({
        organizationId: orgId,
        boardId: board!.id,
        title,
        searchConfig: "english",
      })
      .returning({ id: posts.id });
    return post!.id;
  }

  it("redirects a stale slug without letting browsers keep the redirect", async () => {
    const id = await postTitled("Dark mode");
    const res = await renderPostPage(
      new Request(`http://localhost/p/${id}-old-title?x=1`),
      env,
      ctx
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      `http://localhost/p/${id}-dark-mode?x=1`
    );
    // Kept forever, an old→new hop would loop once the title changes back.
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
