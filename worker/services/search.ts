import { type SQL, sql } from "drizzle-orm";
import type { Locale } from "@/shared/locale";
import { posts, type SearchConfig } from "../db/schema";

/** The Postgres text-search config for a workspace's language. */
export const searchConfigFor = (locale: Locale): SearchConfig =>
  locale === "tr" ? "turkish" : "english";

/**
 * Feed search: every word, stemmed in each post's own language, or a title
 * close enough to forgive a typo (pg_trgm's %>, threshold 0.6). Both sides
 * go through pano_fold, so case and Turkish letters never decide a match.
 */
export function matchesSearch(q: string): SQL {
  return sql`(${posts.search} @@ websearch_to_tsquery(${posts.searchConfig}, pano_fold(${q})) or pano_fold(${posts.title}) %> pano_fold(${q}))`;
}
