import { useFormatter, useNow, useTranslations } from "use-intl";
import { Markdown } from "@/components/markdown";
import { StatusBadge } from "@/components/status-badge";
import { AuthorName } from "@/features/posts/author-name";
import type { StatusChangeView } from "@/shared/posts";

/** A post's status changes, oldest first, with the team's notes. */
export function StatusTimeline({ timeline }: { timeline: StatusChangeView[] }) {
  const t = useTranslations("status");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  if (timeline.length === 0) return null;
  return (
    <section aria-labelledby="timeline-heading" className="flex flex-col gap-3">
      <h2 id="timeline-heading" className="font-semibold text-lg">
        {t("timelineHeading")}
      </h2>
      <ol className="flex flex-col gap-3">
        {timeline.map((entry) => (
          <li key={entry.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
              <span className="sr-only">{t("movedTo")}</span>
              <StatusBadge status={entry.to} />
              <span aria-hidden="true">·</span>
              <AuthorName author={entry.by} />
              <span aria-hidden="true">·</span>
              <time dateTime={entry.createdAt}>
                {format.relativeTime(new Date(entry.createdAt), now)}
              </time>
            </div>
            {entry.note && <Markdown>{entry.note}</Markdown>}
          </li>
        ))}
      </ol>
    </section>
  );
}
