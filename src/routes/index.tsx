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
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-24">
      <h1 className="font-semibold text-4xl tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("tagline")}</p>
      {me.isPending ? null : user ? (
        <p>{t("signedInAs", { email: user.email })}</p>
      ) : (
        <div>
          <Button asChild>
            <Link to="/signin">{t("signInCta")}</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
