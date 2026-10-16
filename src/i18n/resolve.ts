import type { Locale } from "@/shared/locale";

/**
 * Which language the interface uses: what the person chose wins, then the
 * workspace's default (on its pages), then the browser's.
 */
export function resolveLocale(input: {
  chosen: Locale | null;
  workspaceDefault: Locale | null;
  browser: Locale;
}): Locale {
  return input.chosen ?? input.workspaceDefault ?? input.browser;
}
