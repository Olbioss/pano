import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { posts } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";

const { db, close } = testDb();
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;
type Workspace = Awaited<ReturnType<typeof setupWorkspace>>;
type Body = { data: { title: string }[] };

async function similar(t: TestApp, slug: string, q: string) {
  const res = await t.client.api.workspaces[":slug"].similar.$get({
    param: { slug },
    query: { q },
  });
  return { status: res.status, body: (await res.json()) as Body };
}

const titles = (body: Body) => body.data.map((post) => post.title);

const add = (t: TestApp, ws: Workspace, title: string, body = "") =>
  submitPost(t, ws.owner.cookie, ws.slug, {
    boardId: ws.boards[0]!.id,
    title,
    body,
  });

/** An English and a Turkish workspace with a few requests each. */
async function fixtures(t: TestApp) {
  const en = await setupWorkspace(t);
  const dark = await add(
    t,
    en,
    "Dark mode",
    "Please add a dark theme for night use"
  );
  await add(t, en, "Export to CSV", "Download my data as a spreadsheet");
  await add(t, en, "Keyboard shortcuts for the editor");
  const shipped = await add(t, en, "Dark sidebar");
  await db
    .update(posts)
    .set({ status: "shipped" })
    .where(eq(posts.id, shipped.id));
  const merged = await add(t, en, "Darker charts");
  await db
    .update(posts)
    .set({ mergedIntoId: dark.id })
    .where(eq(posts.id, merged.id));
  const tr = await setupWorkspace(t, { defaultLocale: "tr" });
  await add(t, tr, "Karanlık mod", "Gece kullanımı için koyu tema");
  await add(t, tr, "İptal edilen rezervasyonlar için bildirim");
  await add(t, tr, "ÖZELLİK: Çoklu şube desteği");
  return { en: en.slug, tr: tr.slug };
}

describe("GET /api/workspaces/:slug/similar", () => {
  it("finds a request by its words, leaving out shipped and merged ones", async () => {
    const t = testApp();
    const { en } = await fixtures(t);
    const { status, body } = await similar(t, en, "dark theme");
    expect(status).toBe(200);
    expect(titles(body)).toEqual(["Dark mode"]);
    await t.settle();
  });

  it("forgives a typo", async () => {
    const t = testApp();
    const { en } = await fixtures(t);
    expect(titles((await similar(t, en, "darkk mod")).body)).toContain(
      "Dark mode"
    );
    await t.settle();
  });

  it("matches on any of the words", async () => {
    const t = testApp();
    const { en } = await fixtures(t);
    expect(titles((await similar(t, en, "exprot csv")).body)).toContain(
      "Export to CSV"
    );
    await t.settle();
  });

  it("stems Turkish, capital İ included", async () => {
    const t = testApp();
    const { tr } = await fixtures(t);
    expect(
      titles((await similar(t, tr, "rezervasyonumu iptal")).body)
    ).toContain("İptal edilen rezervasyonlar için bildirim");
    await t.settle();
  });

  it("matches Turkish typed without Turkish letters", async () => {
    const t = testApp();
    const { tr } = await fixtures(t);
    expect(titles((await similar(t, tr, "coklu sube")).body)).toContain(
      "ÖZELLİK: Çoklu şube desteği"
    );
    await t.settle();
  });

  it("stays inside the workspace", async () => {
    const t = testApp();
    const { tr } = await fixtures(t);
    expect(titles((await similar(t, tr, "dark mode")).body)).not.toContain(
      "Dark mode"
    );
    await t.settle();
  });

  it("returns at most five", async () => {
    const t = testApp();
    const ws = await setupWorkspace(t);
    for (let i = 1; i <= 7; i++) await add(t, ws, `Dark mode idea ${i}`);
    expect((await similar(t, ws.slug, "dark mode")).body.data).toHaveLength(5);
    await t.settle();
  });

  it("refuses a one-letter query", async () => {
    const t = testApp();
    const ws = await setupWorkspace(t);
    expect((await similar(t, ws.slug, "a")).status).toBe(400);
    await t.settle();
  });

  it("survives search syntax", async () => {
    const t = testApp();
    const ws = await setupWorkspace(t);
    await add(t, ws, "Dark mode");
    expect((await similar(t, ws.slug, "dark & | ! (")).status).toBe(200);
    await t.settle();
  });

  it("treats a word starting with a minus sign as a plain word", async () => {
    const t = testApp();
    const { en } = await fixtures(t);
    const { body } = await similar(t, en, "Balance shows -5 after refund");
    expect(titles(body)).toEqual([]);
    await t.settle();
  });
});
