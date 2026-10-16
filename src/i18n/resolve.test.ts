import { describe, expect, it } from "vitest";
import { resolveLocale } from "./resolve";

describe("resolveLocale", () => {
  it("lets the person's choice win", () => {
    const locale = resolveLocale({
      chosen: "tr",
      workspaceDefault: "en",
      browser: "en",
    });
    expect(locale).toBe("tr");
  });

  it("uses the workspace's default when nothing was chosen", () => {
    const locale = resolveLocale({
      chosen: null,
      workspaceDefault: "tr",
      browser: "en",
    });
    expect(locale).toBe("tr");
  });

  it("falls back to the browser", () => {
    const locale = resolveLocale({
      chosen: null,
      workspaceDefault: null,
      browser: "tr",
    });
    expect(locale).toBe("tr");
  });
});
