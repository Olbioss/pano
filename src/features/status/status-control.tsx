import { useEffect, useId, useState } from "react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PostDetail } from "@/shared/posts";
import { POST_STATUSES, type PostStatus } from "@/shared/status";
import { useChangeStatus } from "./use-change-status";

/**
 * The team's status picker on a post's page. Picking a new status offers a
 * note for the timeline. The change shows at once and rolls back with a
 * toast if it fails.
 */
export function StatusControl({ post }: { post: PostDetail }) {
  const t = useTranslations("status");
  const tStatuses = useTranslations("statuses");
  const change = useChangeStatus();
  const id = useId();
  const [status, setStatus] = useState<PostStatus>(post.status);
  const [note, setNote] = useState("");
  // Follows a change made elsewhere: the roadmap, or a refetch.
  useEffect(() => setStatus(post.status), [post.status]);
  const changed = status !== post.status;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = note.trim();
        change.mutate(
          {
            post,
            workspace: post.workspace.slug,
            status,
            ...(trimmed ? { note: trimmed } : {}),
          },
          { onSuccess: () => setNote("") }
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-status`}>{t("label")}</Label>
          <select
            id={`${id}-status`}
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as PostStatus)}
          >
            {POST_STATUSES.map((option) => (
              <option key={option} value={option}>
                {tStatuses(option)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" disabled={!changed}>
          {t("update")}
        </Button>
      </div>
      {changed && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-note`}>{t("noteLabel")}</Label>
          <Textarea
            id={`${id}-note`}
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t("noteHint")}</p>
        </div>
      )}
    </form>
  );
}
