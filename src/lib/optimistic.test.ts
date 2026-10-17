import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { applyOptimistic, patch } from "./optimistic";

type Counter = { id: number; count: number };

const bump = (id: number) =>
  patch<Counter[]>({ queryKey: ["counters"] }, (list) => {
    for (const counter of list) {
      if (counter.id === id) counter.count += 1;
    }
  });

describe("applyOptimistic", () => {
  it("patches every query that matches", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["counters", "a"], [{ id: 1, count: 0 }]);
    qc.setQueryData(
      ["counters", "b"],
      [
        { id: 1, count: 5 },
        { id: 2, count: 0 },
      ]
    );
    await applyOptimistic(qc, [bump(1)]);
    expect(qc.getQueryData(["counters", "a"])).toEqual([{ id: 1, count: 1 }]);
    expect(qc.getQueryData(["counters", "b"])).toEqual([
      { id: 1, count: 6 },
      { id: 2, count: 0 },
    ]);
  });

  it("skips a matching query that has no data yet", async () => {
    const qc = new QueryClient();
    qc.getQueryCache().build(qc, { queryKey: ["counters", "empty"] });
    await expect(applyOptimistic(qc, [bump(1)])).resolves.toBeTypeOf(
      "function"
    );
    expect(qc.getQueryData(["counters", "empty"])).toBeUndefined();
  });

  it("restores every patched query on rollback", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["counters", "a"], [{ id: 1, count: 0 }]);
    qc.setQueryData(["counters", "b"], [{ id: 1, count: 5 }]);
    const rollback = await applyOptimistic(qc, [bump(1)]);
    rollback();
    expect(qc.getQueryData(["counters", "a"])).toEqual([{ id: 1, count: 0 }]);
    expect(qc.getQueryData(["counters", "b"])).toEqual([{ id: 1, count: 5 }]);
  });

  it("restores a query two patches touched to what it held first", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["counters", "a"], [{ id: 1, count: 0 }]);
    const rollback = await applyOptimistic(qc, [bump(1), bump(1)]);
    expect(qc.getQueryData(["counters", "a"])).toEqual([{ id: 1, count: 2 }]);
    rollback();
    expect(qc.getQueryData(["counters", "a"])).toEqual([{ id: 1, count: 0 }]);
  });

  it("stops an in-flight fetch so its stale answer can't land on top", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["counters", "a"], [{ id: 1, count: 0 }]);
    let answer: (value: Counter[]) => void = () => {};
    const fetching = qc
      .fetchQuery({
        queryKey: ["counters", "a"],
        queryFn: () =>
          new Promise<Counter[]>((resolve) => {
            answer = resolve;
          }),
        staleTime: 0,
      })
      // Cancelled: it rejects, or resolves with the data it reverted to.
      .catch(() => undefined);
    await applyOptimistic(qc, [bump(1)]);
    answer([{ id: 1, count: 99 }]);
    await fetching;
    expect(qc.getQueryData(["counters", "a"])).toEqual([{ id: 1, count: 1 }]);
  });
});
