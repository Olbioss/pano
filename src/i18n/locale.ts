export const LOCALES = ["en", "tr"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * The interface language from a browser language tag: Turkish for any `tr`
 * variant, English for everything else. Phase 1 puts the user's saved choice
 * and the workspace default in front of this.
 */
export function localeFromLanguageTag(tag: string | undefined): Locale {
  return tag?.toLowerCase().split("-")[0] === "tr" ? "tr" : "en";
}
