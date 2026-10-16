export const LOCALES = ["en", "tr"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Remembers the language a person picked. The server reads it too, to write
 * code emails in that language.
 */
export const LOCALE_COOKIE = "pano-locale";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "tr";
}

/**
 * The interface language from a browser language tag: Turkish for any `tr`
 * variant, English for everything else.
 */
export function localeFromLanguageTag(tag: string | undefined): Locale {
  return tag?.toLowerCase().split("-")[0] === "tr" ? "tr" : "en";
}

/** The chosen language from a Cookie header or `document.cookie`, if any. */
export function localeFromCookie(
  cookie: string | null | undefined
): Locale | null {
  for (const part of (cookie ?? "").split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === LOCALE_COOKIE) return isLocale(value) ? value : null;
  }
  return null;
}
