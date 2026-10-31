import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  CHANGELOG_PAGE,
  type ChangelogEntry,
  type ChangelogPage,
} from "@/shared/changelog";
import type { Locale } from "@/shared/locale";
import { postRef } from "@/shared/ref";
import type { Database } from "../db/client";
import { organization, posts, statusChanges } from "../db/schema";
import type { Flags } from "../env";

/**
 * A workspace's shipped requests, newest first, each with the team's note on
 * its latest move to Shipped. Merged requests live on in their originals, so
 * they're left out.
 */
export async function listChangelog(
  db: Database,
  input: { workspaceId: string; page: number }
): Promise<ChangelogPage> {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      voteCount: posts.voteCount,
      statusChangedAt: posts.statusChangedAt,
      createdAt: posts.createdAt,
      // Qualified by hand: inside a select without joins, Drizzle would
      // print posts.id as a bare "id", which the subquery reads as sc.id.
      note: sql<
        string | null
      >`(select sc.note from ${statusChanges} as sc where sc.post_id = ${posts}.id and sc.to_status = 'shipped' order by sc.id desc limit 1)`,
    })
    .from(posts)
    .where(
      and(
        eq(posts.organizationId, input.workspaceId),
        eq(posts.status, "shipped"),
        isNull(posts.mergedIntoId)
      )
    )
    .orderBy(sql`${posts.statusChangedAt} desc nulls last`, desc(posts.id))
    .limit(CHANGELOG_PAGE + 1)
    .offset((input.page - 1) * CHANGELOG_PAGE);
  return {
    entries: rows.slice(0, CHANGELOG_PAGE).map(
      (row): ChangelogEntry => ({
        id: row.id,
        ref: postRef(row.id, row.title),
        title: row.title,
        voteCount: row.voteCount,
        // Every move to Shipped sets it; older rows fall back.
        shippedAt: (row.statusChangedAt ?? row.createdAt).toISOString(),
        note: row.note,
      })
    ),
    page: input.page,
    hasMore: rows.length > CHANGELOG_PAGE,
  };
}

/** How long KV keeps a workspace's rendered feed. */
export const CHANGELOG_CACHE_SECONDS = 60 * 60;

/** The KV key of a workspace's rendered feed: by slug, so a hit needs no query. */
export const changelogKey = (slug: string) => `changelog:${slug}`;

/** Feed readers fetch it again; the next one rebuilds it. */
export function dropChangelog(flags: Flags, slug: string) {
  return flags.delete(changelogKey(slug));
}

/**
 * The slug of the workspace whose changelog shows this post, or null when
 * the post isn't on one: an edit, merge or delete of it changes the feed.
 */
export async function changelogOf(
  db: Database,
  postId: number
): Promise<string | null> {
  const [row] = await db
    .select({ slug: organization.slug })
    .from(posts)
    .innerJoin(organization, eq(organization.id, posts.organizationId))
    .where(
      and(
        eq(posts.id, postId),
        eq(posts.status, "shipped"),
        isNull(posts.mergedIntoId)
      )
    )
    .limit(1);
  return row?.slug ?? null;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * The changelog as an Atom 1.0 feed: the latest entries, each linking to its
 * request, with the team's note as the summary.
 */
export function changelogFeed(input: {
  origin: string;
  workspace: { name: string; slug: string; defaultLocale: Locale };
  entries: ChangelogEntry[];
  now?: Date;
}) {
  const title =
    input.workspace.defaultLocale === "tr"
      ? `${input.workspace.name} yenilikleri`
      : `${input.workspace.name} changelog`;
  const page = new URL(`/${input.workspace.slug}/changelog`, input.origin);
  const self = new URL(
    `/api/workspaces/${input.workspace.slug}/changelog.atom`,
    input.origin
  );
  const updated =
    input.entries[0]?.shippedAt ?? (input.now ?? new Date()).toISOString();
  const entries = input.entries.map((entry) => {
    const link = new URL(`/p/${entry.ref}`, input.origin);
    return [
      "  <entry>",
      `    <title>${escapeXml(entry.title)}</title>`,
      `    <id>${escapeXml(new URL(`/p/${entry.id}`, input.origin).toString())}</id>`,
      `    <link rel="alternate" type="text/html" href="${escapeXml(link.toString())}"/>`,
      `    <updated>${entry.shippedAt}</updated>`,
      ...(entry.note
        ? [`    <summary>${escapeXml(entry.note)}</summary>`]
        : []),
      "  </entry>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>${escapeXml(title)}</title>`,
    `  <id>${escapeXml(page.toString())}</id>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(page.toString())}"/>`,
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(self.toString())}"/>`,
    `  <updated>${updated}</updated>`,
    `  <author><name>${escapeXml(input.workspace.name)}</name></author>`,
    ...entries,
    "</feed>",
    "",
  ].join("\n");
}
