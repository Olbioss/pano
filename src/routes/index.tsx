import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { api, unwrap } from "@/lib/api";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const t = useTranslations("home");
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => unwrap(await api.health.$get()),
    retry: 1,
  });

  const status = health.isPending
    ? t("apiChecking")
    : health.isError
      ? t("apiDown")
      : t("apiUp");

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-4 p-6">
      <h1 className="text-4xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("tagline")}</p>
      <div className="flex items-center gap-3">
        <output aria-live="polite">{status}</output>
        <Button
          variant="outline"
          size="sm"
          onClick={() => health.refetch()}
          disabled={health.isFetching}
        >
          {t("retry")}
        </Button>
      </div>
    </main>
  );
}
