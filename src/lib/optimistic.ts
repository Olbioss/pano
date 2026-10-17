import {
  hashKey,
  type QueryClient,
  type QueryFilters,
  type QueryKey,
} from "@tanstack/react-query";
import { type Draft, produce } from "immer";

/** One change, applied to every cached query that matches `filters`. */
export type CachePatch = {
  filters: QueryFilters;
  update: (draft: Draft<unknown>) => void;
};

/** A patch for queries holding `T`; the type is checked here, then erased. */
export function patch<T>(
  filters: QueryFilters,
  update: (draft: Draft<T>) => void
): CachePatch {
  return { filters, update: update as (draft: Draft<unknown>) => void };
}

/**
 * Applies each patch to every matching query that has data, and returns what
 * each query held before the first patch touched it.
 */
export function patchQueries(qc: QueryClient, patches: CachePatch[]) {
  const before = new Map<string, [QueryKey, unknown]>();
  for (const { filters, update } of patches) {
    for (const [key, data] of qc.getQueriesData(filters)) {
      // A query that never loaded has nothing to patch. (BetterNews ran
      // immer's current() on one and threw.)
      if (data === undefined) continue;
      const hash = hashKey(key);
      if (!before.has(hash)) before.set(hash, [key, data]);
      qc.setQueryData(key, produce(data, update));
    }
  }
  return before;
}

/**
 * The optimistic half of a mutation. It stops in-flight fetches of the
 * matching queries, so a stale answer can't land on top, patches every one
 * that has data, and returns a rollback that restores them all. (BetterNews
 * kept a single snapshot.)
 */
export async function applyOptimistic(
  qc: QueryClient,
  patches: CachePatch[]
): Promise<() => void> {
  await Promise.all(patches.map(({ filters }) => qc.cancelQueries(filters)));
  const before = patchQueries(qc, patches);
  return () => {
    for (const [key, data] of before.values()) qc.setQueryData(key, data);
  };
}
