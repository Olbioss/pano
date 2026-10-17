import { useTranslations } from "use-intl";
import type { PostStatus } from "@/shared/status";

// Plain tones for now; Phase 5's visual pass revisits them.
const TONE: Record<PostStatus, string> = {
  open: "bg-muted text-foreground",
  under_review:
    "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  planned: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  in_progress:
    "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100",
  shipped:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  closed: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function StatusBadge({ status }: { status: PostStatus }) {
  const t = useTranslations("statuses");
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-medium text-xs ${TONE[status]}`}
    >
      {t(status)}
    </span>
  );
}
