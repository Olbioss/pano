// Turkish letters that NFKD can't fold: ı has no decomposition, and İ
// lowercases to "i̇" (i plus a combining dot). Map them first.
const TURKISH: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  İ: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  Ç: "c",
  Ğ: "g",
  Ö: "o",
  Ş: "s",
  Ü: "u",
};

/**
 * A URL-safe slug: Turkish-aware, lowercase ASCII letters and digits joined by
 * single hyphens, at most 40 characters.
 */
export function slugify(input: string): string {
  return input
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (ch) => TURKISH[ch] ?? ch)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/**
 * Top-level paths the app uses, plus names that would read as Pano's own. A
 * workspace can't take them.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "about",
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "blog",
  "cdn-cgi",
  "docs",
  "help",
  "login",
  "logout",
  "me",
  "new",
  "new-workspace",
  "p",
  "pricing",
  "settings",
  "sign-in",
  "sign-up",
  "signin",
  "signup",
  "static",
  "www",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}
