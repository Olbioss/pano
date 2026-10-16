import { type ReactNode, useEffect } from "react";
import { IntlProvider } from "use-intl";
import { type Locale, localeFromLanguageTag } from "@/shared/locale";
import en from "./messages/en.json";
import tr from "./messages/tr.json";

// `satisfies` makes a key missing from tr.json a compile error too.
const messages = { en, tr } satisfies Record<Locale, typeof en>;

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = localeFromLanguageTag(navigator.language);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <IntlProvider
      locale={locale}
      messages={messages[locale]}
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
    >
      {children}
    </IntlProvider>
  );
}
