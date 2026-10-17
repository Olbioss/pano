import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";

// useVote relies on this TanStack Query behavior, so it's pinned here. A
// second mutation in the same scope runs onMutate at once (the button flips
// on the click), but sends its request only after the first one finishes.
it("runs a queued mutation's onMutate at once and its request after the first", async () => {
  const qc = new QueryClient();
  const events: string[] = [];
  let finishFirst: () => void = () => {};
  const firstRequest = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });
  const observer = (label: string, wait?: Promise<void>) =>
    new MutationObserver(qc, {
      mutationKey: ["vote", 1],
      scope: { id: "vote:1" },
      mutationFn: async () => {
        events.push(`${label}:request`);
        await wait;
      },
      onMutate: () => {
        events.push(`${label}:onMutate`);
      },
    });
  const first = observer("first", firstRequest).mutate();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = observer("second").mutate();
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(events).toEqual([
    "first:onMutate",
    "first:request",
    "second:onMutate",
  ]);
  expect(qc.isMutating({ mutationKey: ["vote", 1] })).toBe(2);
  finishFirst();
  await Promise.all([first, second]);
  expect(events).toEqual([
    "first:onMutate",
    "first:request",
    "second:onMutate",
    "second:request",
  ]);
});
