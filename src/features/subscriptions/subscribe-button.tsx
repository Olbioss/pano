import { Bell, BellOff } from "lucide-react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import type { PostDetail } from "@/shared/posts";
import { useSubscription } from "./use-subscription";

/** Follows or unfollows a post: followers get an email when it ships. */
export function SubscribeButton({ post }: { post: PostDetail }) {
  const t = useTranslations("subscription");
  const subscription = useSubscription(post.id);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => subscription.mutate(!post.subscribed)}
      >
        {post.subscribed ? (
          <BellOff aria-hidden="true" />
        ) : (
          <Bell aria-hidden="true" />
        )}
        {post.subscribed ? t("unsubscribe") : t("subscribe")}
      </Button>
      {!post.subscribed && (
        <span className="text-muted-foreground text-xs">{t("hint")}</span>
      )}
    </div>
  );
}
