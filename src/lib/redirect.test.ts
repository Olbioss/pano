import { describe, expect, it } from "vitest";
import { safeRedirect } from "./redirect";

describe("safeRedirect", () => {
  it.each(["/acme/settings", "/acme?board=bugs"])("keeps %s", (path) => {
    expect(safeRedirect(path)).toBe(path);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
  ])("drops %s", (value) => {
    expect(safeRedirect(value)).toBeUndefined();
  });

  it("drops anything that isn't a string", () => {
    expect(safeRedirect(42)).toBeUndefined();
  });
});
