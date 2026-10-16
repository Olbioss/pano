import {
  type Locale,
  localeFromCookie,
  localeFromLanguageTag,
} from "@/shared/locale";

/**
 * The language for a message the server writes: the person's choice, then
 * their browser's first language, then English.
 */
export function localeFromHeaders(headers: Headers): Locale {
  const firstLanguage = headers.get("accept-language")?.split(",")[0]?.trim();
  return (
    localeFromCookie(headers.get("cookie")) ??
    localeFromLanguageTag(firstLanguage)
  );
}
