import { describe, expect, it } from "vitest";
import en from "./messages/en.json";
import tr from "./messages/tr.json";

// The catalogs must stay structurally identical: a key in one language but not
// the other shows up at runtime as a missing-message error.
function keyTree(obj: unknown, prefix = ""): string[] {
  if (Array.isArray(obj)) return [`${prefix}[]`];
  if (obj !== null && typeof obj === "object") {
    return Object.entries(obj).flatMap(([key, value]) =>
      keyTree(value, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [prefix];
}

function flatten(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, string> {
  return Object.entries(obj).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string") acc[path] = value;
      else if (value && typeof value === "object" && !Array.isArray(value)) {
        Object.assign(acc, flatten(value as Record<string, unknown>, path));
      }
      return acc;
    },
    {}
  );
}

// Argument names per message, ignoring ICU plural/select clause bodies.
function placeholders(obj: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(flatten(obj))) {
    const cleaned = value.replace(
      /(zero|one|two|few|many|other|=\d+)\s*\{[^}]*\}/g,
      ""
    );
    const names = [
      ...new Set([...cleaned.matchAll(/\{(\w+)/g)].map((m) => m[1])),
    ]
      .sort()
      .join(",");
    map.set(key, names);
  }
  return map;
}

describe("message catalogs", () => {
  it("en and tr have identical key trees", () => {
    expect(keyTree(en).sort()).toEqual(keyTree(tr).sort());
  });

  it("placeholders match between locales", () => {
    expect(placeholders(en)).toEqual(placeholders(tr));
  });
});
