import { describe, expect, it } from "vitest";
import { feedParams, feedSearchSchema } from "./search";

const read = (raw: Record<string, unknown>) =>
  feedParams(feedSearchSchema.parse(raw));

describe("feed URL state", () => {
  it.each([{ sort: "hot" }, { page: 0 }, { status: "done" }])(
    "falls back to the defaults for %j",
    (raw) => {
      expect(read(raw)).toEqual({
        board: undefined,
        sort: "trending",
        status: undefined,
        q: undefined,
        page: 1,
      });
    }
  );

  it("keeps valid values", () => {
    expect(
      read({
        board: "bugs",
        sort: "top",
        status: "planned",
        q: "dark",
        page: 2,
      })
    ).toEqual({
      board: "bugs",
      sort: "top",
      status: "planned",
      q: "dark",
      page: 2,
    });
  });

  it("drops a blank search", () => {
    expect(read({ q: "   " }).q).toBeUndefined();
  });

  it("keeps the first 100 characters of a long search", () => {
    expect(read({ q: "x".repeat(150) }).q).toBe("x".repeat(100));
  });
});
