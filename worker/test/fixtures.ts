import { eq } from "drizzle-orm";
import type { Locale } from "@/shared/locale";
import { member, organization, user } from "../db/schema";
import type { testApp } from "./app";
import { testDb } from "./db";

type TestApp = ReturnType<typeof testApp>;
type Board = { id: string; slug: string; name: string; position: number };

export const uniqueSlug = (prefix = "ws") =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

/**
 * Puts the account with `email` straight on the workspace's team, the way an
 * accepted invitation does, and answers its user id.
 */
export async function addToTeam(
  slug: string,
  email: string,
  role: "admin" | "member"
) {
  const { db, close } = testDb();
  try {
    const [workspace] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, slug));
    const [person] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email));
    if (!workspace || !person) throw new Error("addToTeam: nobody to add");
    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId: workspace.id,
      userId: person.id,
      role,
      createdAt: new Date(),
    });
    return person.id;
  } finally {
    await close();
  }
}

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

/** Votes through the API as `cookie`. */
export const voteFor = (
  t: TestApp,
  cookie: string,
  postId: number,
  voted = true
) =>
  t.client.api.posts[":id"].vote.$put(
    { param: { id: String(postId) }, json: { voted } },
    { headers: { cookie } }
  );

/** Comments through the API as `cookie`; returns the comment and the new count. */
export async function commentOn(
  t: TestApp,
  cookie: string,
  postId: number,
  body: string,
  parentId?: number
) {
  const res = await t.client.api.posts[":id"].comments.$post(
    {
      param: { id: String(postId) },
      json: parentId === undefined ? { body } : { body, parentId },
    },
    { headers: { cookie } }
  );
  const json = await res.json();
  if (!json.success) throw new Error(`comment failed: ${json.error}`);
  return json.data;
}
