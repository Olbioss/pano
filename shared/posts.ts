import type { CommentView } from "./comments";
import type { Locale } from "./locale";
import type { PostStatus, RoadmapStatus } from "./status";

/** A post as feeds and lists show it. */
export type PostSummary = {
  id: number;
  /** "123-dark-mode": the post's address segment under /p/. */
  ref: string;
  title: string;
  excerpt: string;
  status: PostStatus;
  voteCount: number;
  /** Comments that aren't deleted. */
  commentCount: number;
  /** Whether the person asking has voted; always false when signed out. */
  voted: boolean;
  board: { slug: string; name: string };
  /** null once the author's account is gone; name is "" until they pick one. */
  author: { name: string } | null;
  createdAt: string;
};

export type PostDetail = PostSummary & {
  body: string;
  workspace: { slug: string; name: string; defaultLocale: Locale };
  /** The person asking wrote it or is on the workspace's team. */
  canEdit: boolean;
  /** The person asking is on the workspace's team: they pin, and delete any comment. */
  isTeam: boolean;
  /** The comment the team pinned above the thread. */
  pinned: CommentView | null;
};

export type FeedPage = { items: PostSummary[]; page: number; hasMore: boolean };

export type VoteResult = { voted: boolean; voteCount: number };

/** One entry on a post's timeline. */
export type StatusChangeView = {
  id: number;
  from: PostStatus;
  to: PostStatus;
  /** The team's note, if they left one. */
  note: string | null;
  /** null once the account is gone; name is "" until they pick one. */
  by: { name: string } | null;
  createdAt: string;
};

/** The public roadmap: each column's unmerged posts. */
export type Roadmap = Record<RoadmapStatus, PostSummary[]>;

export type SubscriptionResult = { subscribed: boolean };
