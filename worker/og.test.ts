import { describe, expect, it } from "vitest";
import { escapeAttribute, postMeta } from "./og";

describe("postMeta", () => {
  const post = {
    id: 12,
    title: "Dark mode",
    body: "Please add a **dark** theme for night use.",
    workspaceName: "Acme",
  };

  it("titles the page with the post and its workspace", () => {
    expect(postMeta(post).title).toBe("Dark mode · Acme");
  });

  it("describes it with the start of the body", () => {
    expect(postMeta(post).description).toBe(
      "Please add a dark theme for night use."
    );
  });

  it("falls back to the workspace when the body is empty", () => {
    expect(postMeta({ ...post, body: "" }).description).toBe(
      "A request on Acme's board"
    );
  });

  it("points at the post's current address", () => {
    expect(postMeta(post).canonicalPath).toBe("/p/12-dark-mode");
  });
});

describe("escapeAttribute", () => {
  it("escapes what could end an attribute or start a tag", () => {
    expect(escapeAttribute(`a&b"c<d>e`)).toBe("a&amp;b&quot;c&lt;d&gt;e");
  });
});
