import { describe, expect, it } from "vitest";
import { replyDepth, replyParentId } from "./comments";

describe("replyParentId", () => {
  it("puts a reply under the comment it answers", () => {
    expect(replyParentId({ id: 5, parentId: null, depth: 0 })).toBe(5);
    expect(replyParentId({ id: 9, parentId: 5, depth: 2 })).toBe(9);
  });

  it("puts a reply to a comment at the deepest level beside it", () => {
    expect(replyParentId({ id: 12, parentId: 9, depth: 3 })).toBe(9);
  });
});

describe("replyDepth", () => {
  it("goes one level deeper, down to the limit", () => {
    expect(replyDepth({ depth: 0 })).toBe(1);
    expect(replyDepth({ depth: 2 })).toBe(3);
    expect(replyDepth({ depth: 3 })).toBe(3);
  });
});
