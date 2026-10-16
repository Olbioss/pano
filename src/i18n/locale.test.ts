import { describe, expect, it } from "vitest";
import { localeFromLanguageTag } from "./locale";

describe("localeFromLanguageTag", () => {
  it.each(["tr", "tr-TR", "TR", "tr-CY"])("picks Turkish for %s", (tag) => {
    expect(localeFromLanguageTag(tag)).toBe("tr");
  });

  it.each(["en", "en-GB", "de-DE", "az-AZ", ""])(
    "picks English for %s",
    (tag) => {
      expect(localeFromLanguageTag(tag)).toBe("en");
    }
  );

  it("picks English when the browser reports nothing", () => {
    expect(localeFromLanguageTag(undefined)).toBe("en");
  });
});
