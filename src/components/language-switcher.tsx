import { useTranslations } from "use-intl";
import { useLocaleControls } from "@/i18n/provider";
import { LOCALES } from "@/shared/locale";
import { Button } from "./ui/button";

export function LanguageSwitcher() {
  const t = useTranslations("header");
  const { locale, setLocale } = useLocaleControls();
  return (
    <fieldset className="flex items-center gap-1">
      <legend className="sr-only">{t("language")}</legend>
      {LOCALES.map((option) => (
        <Button
          key={option}
          size="sm"
          variant={option === locale ? "secondary" : "ghost"}
          aria-pressed={option === locale}
          onClick={() => setLocale(option)}
        >
          {option.toUpperCase()}
        </Button>
      ))}
    </fieldset>
  );
}
