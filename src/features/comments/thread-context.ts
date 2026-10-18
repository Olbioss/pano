import { createContext, useContext } from "react";
import type { PostDetail } from "@/shared/posts";

/** What every comment in a thread needs to know about the thread. */
export type ThreadState = { post: PostDetail };

export const ThreadContext = createContext<ThreadState | null>(null);

/** The thread around a comment. Only for components inside CommentThread. */
export function useThread(): ThreadState {
  const state = useContext(ThreadContext);
  if (!state) throw new Error("useThread must be used inside CommentThread");
  return state;
}
