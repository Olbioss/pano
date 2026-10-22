import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { signInDemo } from "@/lib/demo";
import { DEMO_WORKSPACE_SLUG, type DemoRole } from "@/shared/demo";

/**
 * The two ways into the demo. The team lands on the roadmap, where cards
 * can be dragged; a member lands on the requests.
 */
export function DemoButtons({ size = "default" }: { size?: "default" | "lg" }) {
  const t = useTranslations("demo");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [starting, setStarting] = useState<DemoRole | null>(null);

  async function start(as: DemoRole) {
    setStarting(as);
    const result = await signInDemo(as);
    if (!result.ok) {
      setStarting(null);
      toast.error(result.status === 429 ? t("tooMany") : t("failed"));
      return;
    }
    // Everything cached so far was read as someone else.
    await queryClient.invalidateQueries();
    const ws = DEMO_WORKSPACE_SLUG;
    await (as === "team"
      ? navigate({ to: "/$ws/roadmap", params: { ws } })
      : navigate({ to: "/$ws", params: { ws } }));
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button
        size={size}
        disabled={starting !== null}
        onClick={() => void start("team")}
      >
        {t("asTeam")}
      </Button>
      <Button
        size={size}
        variant="outline"
        disabled={starting !== null}
        onClick={() => void start("member")}
      >
        {t("asMember")}
      </Button>
    </div>
  );
}
