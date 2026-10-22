import { describe, expect, it } from "vitest";
import { isReservedSlug, slugify } from "./slug";

describe("slugify", () => {
  it.each([
    ["Özellik İstekleri", "ozellik-istekleri"],
    ["Çağrı Merkezi Şubesi", "cagri-merkezi-subesi"],
    ["Dark mode!!", "dark-mode"],
    ["  Café  au lait ", "cafe-au-lait"],
    ["Bugs & Problems", "bugs-problems"],
    ["--Hello--World--", "hello-world"],
    ["!!!", ""],
  ])("turns %j into %j", (input, slug) => {
    expect(slugify(input)).toBe(slug);
  });

  it("stops at 40 characters without a trailing hyphen", () => {
    expect(slugify(`${"a".repeat(39)} bcdef`)).toBe("a".repeat(39));
  });
});

describe("isReservedSlug", () => {
  it.each(["api", "signin", "new-workspace", "p", "demo", "pano"])(
    "reserves %s",
    (slug) => {
      expect(isReservedSlug(slug)).toBe(true);
    }
  );

  it("leaves ordinary names free", () => {
    expect(isReservedSlug("acme")).toBe(false);
  });
});
