import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { authClient } from "@/lib/auth-client";
import { meQueryOptions } from "@/lib/session";
import { LanguageSwitcher } from "./language-switcher";
import { Button } from "./ui/button";

export function SiteHeader() {
  const t = useTranslations("header");
  const me = useQuery(meQueryOptions);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const user = me.data?.user;

  async function signOut() {
    await authClient.signOut();
    await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
    await navigate({ to: "/" });
  }

  return (
    <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
      <Link
        to="/"
        className="flex items-center gap-2 font-bold font-heading text-xl tracking-tight"
      >
        {/* A pushpin: the board's own mark. */}
        <span
          aria-hidden="true"
          className="size-3 rounded-full bg-foreground shadow-[inset_-2px_-2px_0_rgb(0_0_0/0.25)]"
        />
        Pano
      </Link>
      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        {user ? (
          <>
            <span className="hidden text-muted-foreground text-sm sm:inline">
              {user.email}
            </span>
            <Button size="sm" variant="outline" onClick={signOut}>
              {t("signOut")}
            </Button>
          </>
        ) : (
          <Button asChild size="sm">
            <Link to="/signin">{t("signIn")}</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
