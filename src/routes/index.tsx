import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { meQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const t = useTranslations("home");
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  const workspace = me.data?.workspaces[0];

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-24">
      <h1 className="font-semibold text-4xl tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("tagline")}</p>
      {me.isPending ? null : (
        <div>
          <Button asChild>
            {!user ? (
              <Link to="/signin">{t("signInCta")}</Link>
            ) : workspace ? (
              <Link to="/$ws" params={{ ws: workspace.slug }}>
                {t("openWorkspace", { name: workspace.name })}
              </Link>
            ) : (
              <Link to="/new-workspace">{t("createWorkspace")}</Link>
            )}
          </Button>
        </div>
      )}
    </main>
  );
}
