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

/** The roadmap's columns, left to right. */
export const ROADMAP_STATUSES = [
  "planned",
  "in_progress",
  "shipped",
] as const satisfies readonly PostStatus[];
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

export function isRoadmapStatus(status: PostStatus): status is RoadmapStatus {
  return (ROADMAP_STATUSES as readonly PostStatus[]).includes(status);
}
