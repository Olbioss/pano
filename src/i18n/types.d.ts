import type en from "./messages/en.json";

// Makes message keys type-checked: t("typo") fails to compile.
declare module "use-intl" {
  interface AppConfig {
    Locale: "en" | "tr";
    Messages: typeof en;
  }
}
