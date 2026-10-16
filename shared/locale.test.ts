import { describe, expect, it } from "vitest";
import { isLocale, localeFromCookie, localeFromLanguageTag } from "./locale";

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

describe("isLocale", () => {
  it.each(["en", "tr"])("accepts %s", (value) => {
    expect(isLocale(value)).toBe(true);
  });

  it.each(["de", "TR", "", undefined, 1])("refuses %s", (value) => {
    expect(isLocale(value)).toBe(false);
  });
});

describe("localeFromCookie", () => {
  it("reads the language cookie among others", () => {
    expect(localeFromCookie("theme=dark; pano-locale=tr; other=1")).toBe("tr");
  });

  it("ignores an unsupported value", () => {
    expect(localeFromCookie("pano-locale=de")).toBeNull();
  });

  it("ignores a cookie whose name only ends the same way", () => {
    expect(localeFromCookie("xpano-locale=tr")).toBeNull();
  });

  it("returns null when there's no cookie", () => {
    expect(localeFromCookie(undefined)).toBeNull();
    expect(localeFromCookie("")).toBeNull();
  });
});
