/**
 * A copy of `items` with the item at `from` moved to `to`. Out-of-range
 * positions return an unchanged copy.
 */
export function move<T>(items: readonly T[], from: number, to: number): T[] {
  const copy = [...items];
  const inRange = (i: number) => i >= 0 && i < copy.length;
  if (!inRange(from) || !inRange(to)) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}
