/** How many entries a changelog page, and the feed, show. */
export const CHANGELOG_PAGE = 20;

/** One shipped request on a workspace's changelog. */
export type ChangelogEntry = {
  id: number;
  /** "123-dark-mode": the request's address segment under /p/. */
  ref: string;
  title: string;
  voteCount: number;
  /** When it moved to Shipped. */
  shippedAt: string;
  /** The team's note on that move, if they left one. */
  note: string | null;
};

export type ChangelogPage = {
  entries: ChangelogEntry[];
  page: number;
  hasMore: boolean;
};
