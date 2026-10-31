import { Link } from "@tanstack/react-router";
import { useFormatter, useTranslations } from "use-intl";
import type { ChangelogEntry } from "@/shared/changelog";

type Month = { label: string; entries: ChangelogEntry[] };

/**
 * Shipped requests by month, in the reader's language and time zone. The
 * entries arrive newest first, so each month is one run of them.
 */
export function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  const t = useTranslations("changelog");
  const format = useFormatter();
  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("empty")}</p>;
  }
  const months: Month[] = [];
  for (const entry of entries) {
    const label = format.dateTime(new Date(entry.shippedAt), {
      year: "numeric",
      month: "long",
    });
    const last = months.at(-1);
    if (last?.label === label) last.entries.push(entry);
    else months.push({ label, entries: [entry] });
  }
  return (
    <div className="flex flex-col gap-8">
      {months.map((month) => (
        <section
          key={month.label}
          aria-label={month.label}
          className="flex flex-col gap-3"
        >
          <h2 className="font-bold text-lg">{month.label}</h2>
          <ol className="flex flex-col gap-3">
            {month.entries.map((entry) => (
              <li key={entry.id} className="paper flex flex-col gap-1 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    to="/p/$ref"
                    params={{ ref: entry.ref }}
                    className="font-semibold hover:underline"
                  >
                    {entry.title}
                  </Link>
                  <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                    {t("votes", { count: entry.voteCount })}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  {t("shipped", {
                    date: format.dateTime(new Date(entry.shippedAt), {
                      day: "numeric",
                      month: "long",
                    }),
                  })}
                </p>
                {entry.note && (
                  <p className="whitespace-pre-line text-sm">{entry.note}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
