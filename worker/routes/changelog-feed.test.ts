import { describe, expect, it, vi } from "vitest";
import type { PostStatus } from "@/shared/status";
import { changelogKey } from "../services/changelog";
import { testApp } from "../test/app";
import { setupWorkspace, submitPost } from "../test/fixtures";

type TestApp = ReturnType<typeof testApp>;

async function moveTo(
  t: TestApp,
  cookie: string,
  postId: number,
  status: PostStatus,
  note?: string
) {
  const res = await t.client.api.posts[":id"].status.$patch(
    {
      param: { id: String(postId) },
      json: note ? { status, note } : { status },
    },
    { headers: { cookie } }
  );
  if (!res.ok) throw new Error(`status change failed: ${res.status}`);
}

const readFeed = (t: TestApp, slug: string) =>
  t.request(`/api/workspaces/${slug}/changelog.atom`);

describe("GET /api/workspaces/:slug/changelog.atom", () => {
  it("is an Atom feed of what shipped, newest first, with every name escaped", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    const post = (title: string) =>
      submitPost(t, owner.cookie, slug, { boardId: boards[0]!.id, title });
    const first = await post("Export to PDF");
    const second = await post("Fish & <chips>");
    await moveTo(t, owner.cookie, first.id, "shipped");
    await moveTo(t, owner.cookie, second.id, "shipped", "Fried & served <hot>");

    const res = await readFeed(t, slug);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/atom+xml; charset=utf-8"
    );
    const feed = await res.text();
    expect(feed.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(
      true
    );
    expect(feed).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(feed).toContain("<title>Acme changelog</title>");
    expect(feed).toContain(
      `<link rel="self" type="application/atom+xml" href="http://localhost/api/workspaces/${slug}/changelog.atom"/>`
    );
    expect(feed.match(/<entry>/g)).toHaveLength(2);
    expect(feed.indexOf("Fish &amp; &lt;chips&gt;")).toBeLessThan(
      feed.indexOf("Export to PDF")
    );
    expect(feed).toContain("<summary>Fried &amp; served &lt;hot&gt;</summary>");
    expect(feed).toContain(`href="http://localhost/p/${second.id}-fish-chips"`);
    expect(feed).not.toContain("<chips>");
    await t.settle();
  });

  it("is titled in the workspace's language", async () => {
    const t = testApp();
    const { slug } = await setupWorkspace(t, { defaultLocale: "tr" });
    expect(await (await readFeed(t, slug)).text()).toContain(
      "<title>Acme yenilikleri</title>"
    );
    await t.settle();
  });

  it("keeps the feed in KV for an hour", async () => {
    const t = testApp();
    const { slug } = await setupWorkspace(t);
    const put = vi.spyOn(t.env.FLAGS, "put");
    const feed = await (await readFeed(t, slug)).text();
    await t.settle();
    expect(put).toHaveBeenCalledWith(changelogKey(slug), feed, {
      expirationTtl: 3600,
    });
  });

  it("answers from KV without opening a connection", async () => {
    // A database nobody can reach: any query would fail the request.
    const t = testApp({
      HYPERDRIVE: { connectionString: "postgresql://nobody@127.0.0.1:1/none" },
    });
    await t.env.FLAGS.put(changelogKey("acme-cached"), "<feed>cached</feed>");
    const res = await readFeed(t, "acme-cached");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<feed>cached</feed>");
    await t.settle();
  });

  it("answers 404 for a workspace that doesn't exist", async () => {
    const t = testApp();
    expect((await readFeed(t, "no-such-workspace")).status).toBe(404);
    await t.settle();
  });
});

describe("the cached feed", () => {
  /** Sets a stale copy, does `change`, and answers whether it was dropped. */
  async function drops(
    t: TestApp,
    slug: string,
    change: () => Promise<unknown>
  ) {
    await t.env.FLAGS.put(changelogKey(slug), "stale");
    await change();
    await t.settle();
    return (await t.env.FLAGS.get(changelogKey(slug))) === null;
  }

  it("is dropped when the changelog changes, and only then", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    const post = (title: string) =>
      submitPost(t, owner.cookie, slug, { boardId: boards[0]!.id, title });
    const shipped = await post("Dark mode");
    const original = await post("Light mode");
    const duplicate = await post("Night mode");
    const planned = await post("Offline mode");

    expect(
      await drops(t, slug, () => moveTo(t, owner.cookie, shipped.id, "shipped"))
    ).toBe(true);
    expect(
      await drops(t, slug, () =>
        t.client.api.posts[":id"].$patch(
          { param: { id: String(shipped.id) }, json: { title: "Dark theme" } },
          { headers: { cookie: owner.cookie } }
        )
      )
    ).toBe(true);
    expect(
      await drops(t, slug, () =>
        moveTo(t, owner.cookie, shipped.id, "in_progress")
      )
    ).toBe(true);
    // Moves that don't touch Shipped, and edits of other requests, keep it.
    expect(
      await drops(t, slug, () => moveTo(t, owner.cookie, planned.id, "planned"))
    ).toBe(false);
    expect(
      await drops(t, slug, () =>
        t.client.api.posts[":id"].$patch(
          { param: { id: String(planned.id) }, json: { title: "Offline" } },
          { headers: { cookie: owner.cookie } }
        )
      )
    ).toBe(false);
    // A shipped duplicate merged away, and a shipped request deleted.
    await moveTo(t, owner.cookie, duplicate.id, "shipped");
    expect(
      await drops(t, slug, () =>
        t.client.api.posts[":id"].merge.$post(
          {
            param: { id: String(duplicate.id) },
            json: { intoId: original.id },
          },
          { headers: { cookie: owner.cookie } }
        )
      )
    ).toBe(true);
    await moveTo(t, owner.cookie, original.id, "shipped");
    expect(
      await drops(t, slug, () =>
        t.client.api.posts[":id"].$delete(
          { param: { id: String(original.id) } },
          { headers: { cookie: owner.cookie } }
        )
      )
    ).toBe(true);
    await t.settle();
  });
});
