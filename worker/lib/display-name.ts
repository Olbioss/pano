import { displayNameSchema } from "@/shared/schemas";

/**
 * A display name as Pano stores it: trimmed, runs of whitespace collapsed,
 * at most 50 characters, or "" when what's left isn't a usable name. Better
 * Auth passes whatever a client sends at sign-in through this.
 */
export function cleanDisplayName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let name = raw.trim().replace(/\s+/g, " ").slice(0, 50);
  // Don't leave half of an emoji (a lone high surrogate) at the cut.
  const last = name.charCodeAt(name.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) name = name.slice(0, -1);
  name = name.trim();
  return displayNameSchema.safeParse(name).success ? name : "";
}
