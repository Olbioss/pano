import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { meQueryOptions } from "@/lib/session";
import { DemoButtons } from "./demo-buttons";

/**
 * Above every page of the demo workspace: what this place is, and for
 * visitors who aren't signed in, the two ways in.
 */
export function DemoBanner() {
  const t = useTranslations("demo");
  const me = useQuery(meQueryOptions);
  return (
    <aside
      aria-label={t("bannerLabel")}
      className="paper flex flex-col gap-3 p-4"
    >
      <p className="max-w-prose text-sm">{t("banner")}</p>
      {me.data && !me.data.user && <DemoButtons />}
    </aside>
  );
}
