import { describe, expect, it } from "vitest";
import { testApp } from "../test/app";

type T = ReturnType<typeof testApp>;

async function workspaceWithOwner(t: T) {
  const owner = await t.signIn();
  const slug = `ws-${crypto.randomUUID().slice(0, 8)}`;
  const res = await t.client.api.workspaces.$post(
    { json: { name: "Acme", slug, defaultLocale: "en" } },
    { headers: { cookie: owner.cookie } }
  );
  if (res.status !== 201) throw new Error(`setup failed: ${res.status}`);
  return { slug, cookie: owner.cookie };
}

async function addBoard(t: T, slug: string, cookie: string, name: string) {
  const res = await t.client.api.workspaces[":slug"].boards.$post(
    { param: { slug }, json: { name } },
    { headers: { cookie } }
  );
  if (res.status !== 201) throw new Error(`board setup failed: ${res.status}`);
  const body = (await res.json()) as { data: { id: string } };
  return body.data.id;
}

async function boardNames(t: T, slug: string) {
  const res = await t.client.api.workspaces[":slug"].$get({ param: { slug } });
  const body = (await res.json()) as { data: { boards: { name: string }[] } };
  return body.data.boards.map((board) => board.name);
}

describe("boards", () => {
  it("lets the team add a board, slugged from its Turkish name", async () => {
    const t = testApp();
    const { slug, cookie } = await workspaceWithOwner(t);

    const res = await t.client.api.workspaces[":slug"].boards.$post(
      { param: { slug }, json: { name: "Özellik İstekleri" } },
      { headers: { cookie } }
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      success: true,
      data: {
        id: expect.any(String),
        slug: "ozellik-istekleri",
        name: "Özellik İstekleri",
        position: 0,
      },
    });
    expect(await boardNames(t, slug)).toEqual(["Özellik İstekleri"]);
    await t.settle();
  });

  it("refuses a second board with the same name", async () => {
    const t = testApp();
    const { slug, cookie } = await workspaceWithOwner(t);
    await addBoard(t, slug, cookie, "Bugs");

    const res = await t.client.api.workspaces[":slug"].boards.$post(
      { param: { slug }, json: { name: "bugs" } },
      { headers: { cookie } }
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: "CONFLICT",
      fields: { name: "BOARD_EXISTS" },
    });
    await t.settle();
  });

  it("keeps board changes to the team", async () => {
    const t = testApp();
    const { slug } = await workspaceWithOwner(t);
    const outsider = await t.signIn();
    const add = (cookie?: string) =>
      t.client.api.workspaces[":slug"].boards.$post(
        { param: { slug }, json: { name: "Ideas" } },
        cookie ? { headers: { cookie } } : undefined
      );

    expect((await add(outsider.cookie)).status).toBe(403);
    expect((await add()).status).toBe(401);
    const unknown = await t.client.api.workspaces[":slug"].boards.$post(
      { param: { slug: "no-such-workspace" }, json: { name: "Ideas" } },
      { headers: { cookie: outsider.cookie } }
    );
    expect(unknown.status).toBe(404);
    await t.settle();
  });

  it("renames a board but keeps its address", async () => {
    const t = testApp();
    const { slug, cookie } = await workspaceWithOwner(t);
    const boardId = await addBoard(t, slug, cookie, "Ideas");

    const res = await t.client.api.workspaces[":slug"].boards[
      ":boardId"
    ].$patch(
      { param: { slug, boardId }, json: { name: "Feature ideas" } },
      { headers: { cookie } }
    );
    expect(await res.json()).toMatchObject({
      data: { id: boardId, slug: "ideas", name: "Feature ideas" },
    });
    await t.settle();
  });

  it("deletes a board, but only from its own workspace", async () => {
    const t = testApp();
    const first = await workspaceWithOwner(t);
    const second = await workspaceWithOwner(t);
    const boardId = await addBoard(t, first.slug, first.cookie, "Ideas");

    const sneaky = await t.client.api.workspaces[":slug"].boards[
      ":boardId"
    ].$delete(
      { param: { slug: second.slug, boardId } },
      { headers: { cookie: second.cookie } }
    );
    expect(sneaky.status).toBe(404);

    const res = await t.client.api.workspaces[":slug"].boards[
      ":boardId"
    ].$delete(
      { param: { slug: first.slug, boardId } },
      { headers: { cookie: first.cookie } }
    );
    expect(res.status).toBe(200);
    expect(await boardNames(t, first.slug)).toEqual([]);
    await t.settle();
  });

  it("reorders boards", async () => {
    const t = testApp();
    const { slug, cookie } = await workspaceWithOwner(t);
    const a = await addBoard(t, slug, cookie, "Alpha");
    const b = await addBoard(t, slug, cookie, "Beta");
    const c = await addBoard(t, slug, cookie, "Gamma");

    const res = await t.client.api.workspaces[":slug"].boards.order.$put(
      { param: { slug }, json: { ids: [c, a, b] } },
      { headers: { cookie } }
    );
    expect(res.status).toBe(200);
    expect(await boardNames(t, slug)).toEqual(["Gamma", "Alpha", "Beta"]);
    await t.settle();
  });

  it("refuses an order that doesn't list every board once", async () => {
    const t = testApp();
    const { slug, cookie } = await workspaceWithOwner(t);
    const a = await addBoard(t, slug, cookie, "Alpha");
    const b = await addBoard(t, slug, cookie, "Beta");
    await addBoard(t, slug, cookie, "Gamma");

    for (const ids of [
      [a, b],
      [a, a, b],
    ]) {
      const res = await t.client.api.workspaces[":slug"].boards.order.$put(
        { param: { slug }, json: { ids } },
        { headers: { cookie } }
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        fields: { ids: "ORDER_MISMATCH" },
      });
    }
    await t.settle();
  });
});
