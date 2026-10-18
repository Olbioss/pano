import type { Locale } from "./locale";
import type { PostStatus } from "./status";

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
};

export type FeedPage = { items: PostSummary[]; page: number; hasMore: boolean };

export type VoteResult = { voted: boolean; voteCount: number };
