import { describe, expect, it } from "vitest";
import { cleanDisplayName } from "./display-name";

describe("cleanDisplayName", () => {
  it.each([
    ["  Ayşe   Yılmaz  ", "Ayşe Yılmaz"],
    ["Zeynep", "Zeynep"],
    ["İsmail\tÇelik", "İsmail Çelik"],
  ])("keeps %j as %j", (raw, name) => {
    expect(cleanDisplayName(raw)).toBe(name);
  });

  it.each(["   ", "!!", "a", 42, undefined])("drops %j", (raw) => {
    expect(cleanDisplayName(raw)).toBe("");
  });

  it("caps a long name at 50 characters", () => {
    expect(cleanDisplayName("a".repeat(80))).toBe("a".repeat(50));
  });

  it("doesn't cut an emoji in half", () => {
    expect(cleanDisplayName(`${"a".repeat(49)}😀`)).toBe("a".repeat(49));
  });
});
