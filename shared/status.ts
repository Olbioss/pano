export const POST_STATUSES = [
  "open",
  "under_review",
  "planned",
  "in_progress",
  "shipped",
  "closed",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Still collecting votes: what "open" means for similar requests. */
export const ACTIVE_STATUSES = [
  "open",
  "under_review",
  "planned",
  "in_progress",
] as const satisfies readonly PostStatus[];
