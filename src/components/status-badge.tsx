import { useTranslations } from "use-intl";
import type { PostStatus } from "@/shared/status";

// Each status inks its stamp in its own color (styles.css, --stamp-*).
const TONE: Record<PostStatus, string> = {
  open: "border-foreground/30 text-foreground",
  under_review: "border-stamp-review/40 bg-stamp-review/10 text-stamp-review",
  planned: "border-stamp-planned/40 bg-stamp-planned/10 text-stamp-planned",
  in_progress:
    "border-stamp-progress/40 bg-stamp-progress/10 text-stamp-progress",
  shipped: "border-stamp-shipped/40 bg-stamp-shipped/10 text-stamp-shipped",
  closed: "border-stamp-closed/40 bg-stamp-closed/10 text-stamp-closed",
};

export function StatusBadge({ status }: { status: PostStatus }) {
  const t = useTranslations("statuses");
  return (
    <span
      className={`inline-flex items-center rounded-[3px] border px-1.5 py-px font-medium text-xs ${TONE[status]}`}
    >
      {t(status)}
    </span>
  );
}
