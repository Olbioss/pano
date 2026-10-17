import { useTranslations } from "use-intl";
import type { PostSummary } from "@/shared/posts";

/** The author's name, or "Anonymous" before they pick one or once they're gone. */
export function AuthorName({ author }: { author: PostSummary["author"] }) {
  const t = useTranslations("post");
  return <span>{author?.name || t("anonymous")}</span>;
}
