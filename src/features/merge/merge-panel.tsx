import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { apiErrorKey, fieldErrorKey } from "@/lib/error-text";
import { commentKeys, postKeys } from "@/lib/keys";
import { feedQueryOptions, mergePost } from "@/lib/posts";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import type { PostDetail, PostSummary } from "@/shared/posts";

type Props = {
  post: PostDetail;
  /** Goes to the post it was merged into. The panel tidies the cache after. */
  onMerged: (target: PostDetail) => Promise<unknown> | undefined;
};

/**
 * The team's merge tool: find the original by its title, confirm, and the
 * duplicate's votes, comments and subscribers move there.
 */
export function MergePanel({ post, onMerged }: Props) {
  const t = useTranslations("merge");
  const tErrors = useTranslations("errors");
  const tFields = useTranslations("fieldErrors");
  const qc = useQueryClient();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<PostSummary | null>(null);
  const q = useDebouncedValue(query.trim(), 300);
  // The feed's search: every status, merged posts left out.
  const results = useQuery({
    ...feedQueryOptions(post.workspace.slug, { sort: "top", page: 1, q }),
    enabled: open && q.length >= 2,
  });
  const merge = useMutation({
    mutationFn: (intoId: number) => mergePost(post.id, intoId),
    networkMode: "always",
  });
  const candidates = (results.data?.items ?? [])
    .filter((item) => item.id !== post.id)
    .slice(0, 5);

  const confirm = (into: PostSummary) =>
    merge.mutate(into.id, {
      onSuccess: async (detail) => {
        qc.setQueryData(postKeys.detail(detail.id), detail);
        // Leave first: dropping this page's post under it would refetch it.
        await onMerged(detail);
        qc.removeQueries({ queryKey: postKeys.detail(post.id), exact: true });
        void qc.invalidateQueries({ queryKey: postKeys.all });
        void qc.invalidateQueries({ queryKey: commentKeys.post(detail.id) });
      },
      onError: (error) => {
        const field =
          error instanceof ApiError && error.fields?.intoId
            ? fieldErrorKey(error.fields.intoId)
            : null;
        toast.error(field ? tFields(field) : tErrors(apiErrorKey(error)));
      },
    });

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        {t("open")}
      </Button>
    );
  }
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id={`${id}-heading`} className="font-medium">
        {t("heading")}
      </h2>
      {target ? (
        <>
          <p className="text-sm">{t("confirm", { title: target.title })}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={merge.isPending}
              onClick={() => confirm(target)}
            >
              {t("confirmButton")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setTarget(null)}
            >
              {t("back")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-search`}>{t("searchLabel")}</Label>
            <Input
              id={`${id}-search`}
              type="search"
              placeholder={t("searchPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {q.length >= 2 && !results.isFetching && candidates.length === 0 && (
            <p className="text-muted-foreground text-sm">{t("noResults")}</p>
          )}
          {candidates.length > 0 && (
            <ul className="flex flex-col gap-1">
              {candidates.map((item) => (
                <li key={item.id}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setTarget(item)}
                  >
                    <span className="truncate">
                      {t("pick", { title: item.title })}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
          >
            {t("cancel")}
          </Button>
        </>
      )}
    </section>
  );
}
