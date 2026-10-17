import { describe, expect, it } from "vitest";
import { parseRef, postRef } from "./ref";

describe("postRef", () => {
  it.each([
    [123, "Dark mode!", "123-dark-mode"],
    [5, "Özellik İstekleri", "5-ozellik-istekleri"],
    [7, "!!!", "7"],
  ])("makes %i and %j into %j", (id, title, ref) => {
    expect(postRef(id, title)).toBe(ref);
  });
});

describe("parseRef", () => {
  it.each([
    ["123-dark-mode", 123],
    ["123", 123],
    ["7-", 7],
  ])("reads %j as %i", (ref, id) => {
    expect(parseRef(ref)).toBe(id);
  });

  it.each(["abc", "0-dark", "12abc", "-5", "", "1234567890123456"])(
    "refuses %j",
    (ref) => {
      expect(parseRef(ref)).toBeNull();
    }
  );
});
