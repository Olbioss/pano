import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FeedParams } from "@/lib/keys";
import { FEED_SORTS } from "@/shared/schemas";
import { POST_STATUSES } from "@/shared/status";
import type { FeedSearch } from "./search";

type Props = {
  boards: { slug: string; name: string }[];
  params: FeedParams;
  /** The search box's text as typed: `params.q` is trimmed. */
  rawQuery: string;
  onChange: (
    next: Partial<FeedSearch>,
    options?: { replace?: boolean }
  ) => void;
};

export function FeedToolbar({ boards, params, rawQuery, onChange }: Props) {
  const t = useTranslations("feed");
  const tStatus = useTranslations("statuses");
  return (
    <div className="flex flex-col gap-3">
      <nav className="flex flex-wrap gap-1" aria-label={t("boards")}>
        <Button
          size="sm"
          variant={params.board ? "ghost" : "secondary"}
          aria-pressed={!params.board}
          onClick={() => onChange({ board: undefined })}
        >
          {t("allBoards")}
        </Button>
        {boards.map((board) => (
          <Button
            key={board.slug}
            size="sm"
            variant={params.board === board.slug ? "secondary" : "ghost"}
            aria-pressed={params.board === board.slug}
            onClick={() => onChange({ board: board.slug })}
          >
            {board.name}
          </Button>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <fieldset className="flex gap-1">
          <legend className="sr-only">{t("sortLabel")}</legend>
          {FEED_SORTS.map((sort) => (
            <Button
              key={sort}
              size="sm"
              variant={params.sort === sort ? "secondary" : "ghost"}
              aria-pressed={params.sort === sort}
              onClick={() =>
                onChange({ sort: sort === "trending" ? undefined : sort })
              }
            >
              {t(`sort.${sort}`)}
            </Button>
          ))}
        </fieldset>
        <label className="sr-only" htmlFor="feed-status">
          {t("statusLabel")}
        </label>
        <select
          id="feed-status"
          className="h-8 rounded-md border bg-transparent px-2 text-sm"
          value={params.status ?? ""}
          onChange={(event) =>
            onChange({
              status: (event.target.value || undefined) as FeedSearch["status"],
            })
          }
        >
          <option value="">{t("allStatuses")}</option>
          {POST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {tStatus(status)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="feed-search">
          {t("searchLabel")}
        </label>
        <Input
          id="feed-search"
          type="search"
          className="w-48"
          maxLength={100}
          placeholder={t("searchPlaceholder")}
          value={rawQuery}
          onChange={(event) =>
            onChange({ q: event.target.value || undefined }, { replace: true })
          }
        />
      </div>
    </div>
  );
}
