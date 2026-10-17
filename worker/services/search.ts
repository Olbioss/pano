import type { Locale } from "@/shared/locale";
import type { SearchConfig } from "../db/schema";

/** The Postgres text-search config for a workspace's language. */
export const searchConfigFor = (locale: Locale): SearchConfig =>
  locale === "tr" ? "turkish" : "english";
