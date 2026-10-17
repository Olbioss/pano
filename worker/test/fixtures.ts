import type { Locale } from "@/shared/locale";
import type { testApp } from "./app";

type TestApp = ReturnType<typeof testApp>;
type Board = { id: string; slug: string; name: string; position: number };

export const uniqueSlug = (prefix = "ws") =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

/** A new owner with a workspace and boards, made through the real API. */
export async function setupWorkspace(
  t: TestApp,
  {
    defaultLocale = "en",
    boards = ["Features"],
  }: { defaultLocale?: Locale; boards?: string[] } = {}
) {
  const owner = await t.signIn();
  const slug = uniqueSlug();
  const created = await t.client.api.workspaces.$post(
    { json: { name: "Acme", slug, defaultLocale } },
    { headers: { cookie: owner.cookie } }
  );
  if (created.status !== 201) {
    throw new Error(`workspace setup failed: ${created.status}`);
  }
  const made: Board[] = [];
  for (const name of boards) {
    const res = await t.client.api.workspaces[":slug"].boards.$post(
      { param: { slug }, json: { name } },
      { headers: { cookie: owner.cookie } }
    );
    const body = await res.json();
    if (!body.success) throw new Error(`board setup failed: ${body.error}`);
    made.push(body.data);
  }
  return { owner, slug, boards: made };
}

/** Posts through the API as `cookie` and returns the new post. */
export async function submitPost(
  t: TestApp,
  cookie: string,
  slug: string,
  input: { boardId: string; title: string; body?: string }
) {
  const res = await t.client.api.workspaces[":slug"].posts.$post(
    { param: { slug }, json: { body: "", ...input } },
    { headers: { cookie } }
  );
  const body = await res.json();
  if (!body.success) throw new Error(`post failed: ${body.error}`);
  return body.data;
}
