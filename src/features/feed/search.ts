import { z } from "zod";
import type { FeedParams } from "@/lib/keys";
import { FEED_SORTS } from "@/shared/schemas";
import { POST_STATUSES } from "@/shared/status";

/** The feed's URL state. A bad value falls back to its default, not an error page. */
export const feedSearchSchema = z.object({
  board: z.string().max(40).optional().catch(undefined),
  sort: z.enum(FEED_SORTS).optional().catch(undefined),
  status: z.enum(POST_STATUSES).optional().catch(undefined),
  q: z.string().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

export type FeedSearch = z.infer<typeof feedSearchSchema>;

export function feedParams(search: FeedSearch): FeedParams {
  return {
    board: search.board,
    sort: search.sort ?? "trending",
    status: search.status,
    q: search.q?.trim() || undefined,
    page: search.page ?? 1,
  };
}
