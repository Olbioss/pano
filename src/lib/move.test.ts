import { describe, expect, it } from "vitest";
import { move } from "./move";

describe("move", () => {
  it("moves an item up to the front", () => {
    expect(move(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("moves an item down one place", () => {
    expect(move(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("returns an unchanged copy for positions out of range", () => {
    const items = ["a", "b"];
    const moved = move(items, 0, 5);
    expect(moved).toEqual(["a", "b"]);
    expect(moved).not.toBe(items);
  });
});
