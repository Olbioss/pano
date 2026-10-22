import { expect, test } from "@playwright/test";

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("a request's link carries its title for previews", async ({ request }) => {
  const feed = await request.get("/api/workspaces/demo/posts?sort=top");
  const { data } = (await feed.json()) as {
    data: { items: { ref: string; title: string }[] };
  };
  const post = data.items[0];
  if (!post) throw new Error("the demo has no requests");

  const page = await request.get(`/p/${post.ref}`);
  expect(page.status()).toBe(200);
  expect(await page.text()).toMatch(
    new RegExp(
      `<meta property="og:title" content="${escapeRegExp(`${post.title} · Inkwell`)}"`
    )
  );
});
