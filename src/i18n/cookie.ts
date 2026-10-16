import { LOCALE_COOKIE, type Locale } from "@/shared/locale";

/** Remembers the person's choice for a year. The server reads it too. */
export function writeLocaleCookie(locale: Locale) {
  // biome-ignore lint/suspicious/noDocumentCookie: one first-party preference cookie; the Cookie Store API isn't in every browser yet
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
