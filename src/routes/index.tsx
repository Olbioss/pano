import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { DemoButtons } from "@/features/demo/demo-buttons";
import { MiniBoard } from "@/features/landing/mini-board";
import { meQueryOptions } from "@/lib/session";
import { isDemoEmail } from "@/shared/demo";

export const Route = createFileRoute("/")({ component: Home });

const POINTS = ["votes", "instant", "duplicates", "languages"] as const;

function Home() {
  const t = useTranslations("home");
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  // Trying the demo signs in as a guest, which would sign a real account out.
  const showDemo = !me.isPending && (!user || isDemoEmail(user.email));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-20 px-6 py-14 md:py-20">
      <section className="grid items-center gap-14 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-6">
          <h1 className="font-bold text-5xl leading-[1.02] md:text-6xl">
            {t("headline")}
          </h1>
          <p className="max-w-[46ch] text-lg">{t("intro")}</p>
          {showDemo && (
            <div className="flex flex-col gap-3">
              <DemoButtons size="lg" />
              <p className="max-w-[46ch] text-muted-foreground text-sm">
                {t("demoNote")}
              </p>
            </div>
          )}
          <YourBoard />
        </div>
        <MiniBoard />
      </section>

      <section aria-labelledby="points" className="flex flex-col gap-8">
        <h2 id="points" className="font-bold text-3xl">
          {t("pointsHeading")}
        </h2>
        <dl className="grid gap-x-12 gap-y-8 md:grid-cols-2">
          {POINTS.map((point) => (
            <div key={point} className="flex flex-col gap-2">
              <dt className="font-heading font-semibold text-xl">
                {t(`${point}Title`)}
              </dt>
              <dd className="max-w-[52ch] text-muted-foreground">
                {t(`${point}Body`)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t pt-6 text-muted-foreground text-sm">
        <p>
          {t.rich("madeBy", {
            link: (chunks) => (
              <a
                className="text-foreground underline-offset-4 hover:underline"
                href="https://olbios.olbios88.workers.dev"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
        <a
          className="text-foreground underline-offset-4 hover:underline"
          href="https://github.com/Olbioss/pano"
        >
          {t("source")}
        </a>
      </footer>
    </main>
  );
}

/** Beyond the demo: Pano's own board, and the visitor's own workspace. */
function YourBoard() {
  const t = useTranslations("home");
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  const workspace = me.data?.workspaces.find((w) => w.slug !== "demo");
  const link = "font-medium underline underline-offset-4";

  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        {t.rich("ownBoard", {
          link: (chunks) => (
            <Link to="/$ws" params={{ ws: "pano" }} className={link}>
              {chunks}
            </Link>
          ),
        })}
      </p>
      {me.isPending ? null : !user || isDemoEmail(user.email) ? (
        <Link to="/signin" className={link}>
          {t("signInCta")}
        </Link>
      ) : workspace ? (
        <Link to="/$ws" params={{ ws: workspace.slug }} className={link}>
          {t("openWorkspace", { name: workspace.name })}
        </Link>
      ) : (
        <Link to="/new-workspace" className={link}>
          {t("createWorkspace")}
        </Link>
      )}
    </div>
  );
}
