import { describe, expect, it } from "vitest";
import { localeFromHeaders } from "./request-locale";

describe("localeFromHeaders", () => {
  it("prefers the language the person chose", () => {
    const headers = new Headers({
      cookie: "pano-locale=tr",
      "accept-language": "en-GB,en;q=0.9",
    });
    expect(localeFromHeaders(headers)).toBe("tr");
  });

  it("falls back to the browser's first language", () => {
    const headers = new Headers({
      "accept-language": "tr-TR,tr;q=0.9,en;q=0.8",
    });
    expect(localeFromHeaders(headers)).toBe("tr");
  });

  it("ignores an unsupported cookie value", () => {
    const headers = new Headers({
      cookie: "pano-locale=de",
      "accept-language": "tr",
    });
    expect(localeFromHeaders(headers)).toBe("tr");
  });

  it("defaults to English", () => {
    expect(localeFromHeaders(new Headers())).toBe("en");
  });
});
