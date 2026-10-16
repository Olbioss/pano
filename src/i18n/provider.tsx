import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { IntlProvider } from "use-intl";
import { z } from "zod";
import {
  type Locale,
  localeFromCookie,
  localeFromLanguageTag,
} from "@/shared/locale";
import { writeLocaleCookie } from "./cookie";
import en from "./messages/en.json";
import tr from "./messages/tr.json";
import { resolveLocale } from "./resolve";

// `satisfies` makes a key missing from tr.json a compile error too.
const messages = { en, tr } satisfies Record<Locale, typeof en>;

type LocaleControls = {
  locale: Locale;
  /** The person's explicit choice, remembered in a cookie. */
  setLocale(locale: Locale): void;
  /** Workspace pages set their default language here; null elsewhere. */
  setWorkspaceDefault(locale: Locale | null): void;
};

const LocaleContext = createContext<LocaleControls | null>(null);

export function useLocaleControls() {
  const controls = useContext(LocaleContext);
  if (!controls) {
    throw new Error("useLocaleControls must be used inside I18nProvider");
  }
  return controls;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [chosen, setChosen] = useState(() => localeFromCookie(document.cookie));
  const [workspaceDefault, setWorkspaceDefault] = useState<Locale | null>(null);
  const locale = resolveLocale({
    chosen,
    workspaceDefault,
    browser: localeFromLanguageTag(navigator.language),
  });

  useEffect(() => {
    document.documentElement.lang = locale;
    // Zod's own validation messages follow the interface language.
    z.config(locale === "tr" ? z.locales.tr() : z.locales.en());
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    writeLocaleCookie(next);
    setChosen(next);
  }, []);

  const controls = useMemo(
    () => ({ locale, setLocale, setWorkspaceDefault }),
    [locale, setLocale]
  );

  return (
    <LocaleContext value={controls}>
      <IntlProvider
        locale={locale}
        messages={messages[locale]}
        timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
      >
        {children}
      </IntlProvider>
    </LocaleContext>
  );
}
