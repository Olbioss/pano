import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Read as text: Vitest replaces imported CSS with an empty string.
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

// The dark block, not the @custom-variant line that names the same query.
const DARK = "@media (prefers-color-scheme: dark) {";

/** The hex colors one block of styles.css sets, by custom property. */
function palette(block: string): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const [, name, hex] of block.matchAll(
    /--([\w-]+):\s*(#[0-9a-f]{6});/gi
  )) {
    colors[name!] = hex!;
  }
  return colors;
}

/** WCAG relative luminance. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const c = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string | undefined, b: string | undefined) {
  if (!a || !b) throw new Error("a color isn't set as hex in styles.css");
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

const light = palette(css.slice(css.indexOf(":root {"), css.indexOf(DARK)));
const dark = palette(css.slice(css.indexOf(DARK)));

// Text on the surfaces it sits on, at WCAG AA for body text.
const TEXT = [
  ["foreground", "board"],
  ["foreground", "card"],
  ["muted-foreground", "board"],
  ["muted-foreground", "card"],
  ["primary-foreground", "primary"],
  ["destructive", "card"],
  ["stamp-review", "card"],
  ["stamp-planned", "card"],
  ["stamp-progress", "card"],
  ["stamp-shipped", "card"],
  ["stamp-closed", "card"],
] as const;

// A form field's edge, which is what shows where it is: 3:1.
const EDGES = [
  ["input", "card"],
  ["input", "board"],
] as const;

describe.each([
  ["light", light],
  ["dark", dark],
])("the %s palette", (_, colors) => {
  it.each(TEXT)("keeps %s readable on %s", (text, surface) => {
    expect(contrast(colors[text], colors[surface])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(EDGES)("keeps %s edges visible on %s", (edge, surface) => {
    expect(contrast(colors[edge], colors[surface])).toBeGreaterThanOrEqual(3);
  });
});
