import { describe, expect, it } from "vitest";
import { excerpt } from "./excerpt";

describe("excerpt", () => {
  it("drops Markdown markers and keeps link text", () => {
    expect(
      excerpt("Use **bold**, `code` and [a link](https://example.com).")
    ).toBe("Use bold, code and a link.");
  });

  it("collapses whitespace", () => {
    expect(excerpt("one\n\n two\tthree")).toBe("one two three");
  });

  it("leaves short text whole", () => {
    expect(excerpt("Short.", 10)).toBe("Short.");
  });

  it("cuts long text at a word and marks the cut", () => {
    expect(excerpt("alpha beta gamma delta", 15)).toBe("alpha beta…");
  });
});
