import { describe, expect, it } from "vitest";
import { testApp } from "../test/app";

const uniqueSlug = () => `ws-${crypto.randomUUID().slice(0, 8)}`;

async function createWorkspace(
  t: ReturnType<typeof testApp>,
  cookie: string,
  slug = uniqueSlug(),
  name = "Acme"
) {
  return t.client.api.workspaces.$post(
    { json: { name, slug, defaultLocale: "en" } },
    { headers: { cookie } }
  );
}

describe("POST /api/workspaces", () => {
  it("creates a workspace and makes its creator the owner", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const slug = uniqueSlug();

    const res = await t.client.api.workspaces.$post(
      { json: { name: "Rezerve", slug, defaultLocale: "tr" } },
      { headers: { cookie } }
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      success: true,
      data: {
        id: expect.any(String),
        slug,
        name: "Rezerve",
        defaultLocale: "tr",
      },
    });

    const me = await t.client.api.me.$get(undefined, { headers: { cookie } });
    expect(await me.json()).toMatchObject({
      data: { workspaces: [{ slug, name: "Rezerve", role: "owner" }] },
    });
    await t.settle();
  });

  it("needs a signed-in user", async () => {
    const t = testApp();
    const res = await t.client.api.workspaces.$post({
      json: { name: "Acme", slug: uniqueSlug(), defaultLocale: "en" },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
    await t.settle();
  });

  it.each([
    ["settings", "SLUG_RESERVED"],
    ["Bad Slug", "SLUG_FORMAT"],
  ])("refuses the address %j with %s", async (slug, error) => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const res = await createWorkspace(t, cookie, slug);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "BAD_REQUEST",
      fields: { slug: error },
    });
    await t.settle();
  });

  it("refuses an address another workspace has", async () => {
    const t = testApp();
    const slug = uniqueSlug();
    const first = await t.signIn();
    await createWorkspace(t, first.cookie, slug, "One");
    const second = await t.signIn();

    const res = await createWorkspace(t, second.cookie, slug, "Two");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: "CONFLICT",
      fields: { slug: "SLUG_TAKEN" },
    });
    await t.settle();
  });

  it("gives each account one workspace", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    await createWorkspace(t, cookie);
    const res = await createWorkspace(t, cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "WORKSPACE_LIMIT" });
    await t.settle();
  });

  it("lets exactly one of two simultaneous claims on an address win", async () => {
    const t = testApp();
    const slug = uniqueSlug();
    const users = await Promise.all([t.signIn(), t.signIn()]);
    const responses = await Promise.all(
      users.map((user) => createWorkspace(t, user.cookie, slug, "Race"))
    );
    expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);
    await t.settle();
  });

  it("turns away a cross-site form post", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const res = await t.request("/api/workspaces", {
      method: "POST",
      headers: {
        cookie,
        origin: "https://evil.example",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "name=Evil&slug=evil-co&defaultLocale=en",
    });
    expect(res.status).toBe(403);
    await t.settle();
  });
});

describe("GET /api/workspaces/:slug", () => {
  it("shows a workspace to anyone", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const slug = uniqueSlug();
    await createWorkspace(t, cookie, slug);

    const res = await t.client.api.workspaces[":slug"].$get({
      param: { slug },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: { slug, name: "Acme", defaultLocale: "en" },
    });
    await t.settle();
  });

  it("answers 404 for an unknown address", async () => {
    const t = testApp();
    const res = await t.client.api.workspaces[":slug"].$get({
      param: { slug: uniqueSlug() },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    await t.settle();
  });
});

describe("PATCH /api/workspaces/:slug", () => {
  it("lets the team rename it and change its language", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const slug = uniqueSlug();
    await createWorkspace(t, cookie, slug);

    const res = await t.client.api.workspaces[":slug"].$patch(
      { param: { slug }, json: { name: "Acme Türkiye", defaultLocale: "tr" } },
      { headers: { cookie } }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: { slug, name: "Acme Türkiye", defaultLocale: "tr" },
    });
    await t.settle();
  });

  it("refuses someone outside the team", async () => {
    const t = testApp();
    const owner = await t.signIn();
    const slug = uniqueSlug();
    await createWorkspace(t, owner.cookie, slug);
    const outsider = await t.signIn();

    const res = await t.client.api.workspaces[":slug"].$patch(
      { param: { slug }, json: { name: "Taken over" } },
      { headers: { cookie: outsider.cookie } }
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    await t.settle();
  });

  it("needs a signed-in user", async () => {
    const t = testApp();
    const res = await t.client.api.workspaces[":slug"].$patch({
      param: { slug: uniqueSlug() },
      json: { name: "Nope" },
    });
    expect(res.status).toBe(401);
    await t.settle();
  });
});
