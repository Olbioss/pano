import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { RoadmapBoard } from "@/features/roadmap/roadmap-board";
import { roadmapQueryOptions } from "@/lib/posts";
import { meQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/$ws/roadmap")({
  loader: ({ context, params }) => {
    // Starts loading with the route instead of after it renders.
    void context.queryClient.prefetchQuery(roadmapQueryOptions(params.ws));
  },
  component: RoadmapPage,
});

function RoadmapPage() {
  const { ws } = Route.useParams();
  const t = useTranslations("roadmap");
  const me = useQuery(meQueryOptions);
  const roadmap = useQuery(roadmapQueryOptions(ws));
  const isTeam = me.data?.workspaces.some((w) => w.slug === ws) ?? false;
  if (roadmap.isPending) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>;
  }
  if (roadmap.isError) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {t("loadFailed")}
      </p>
    );
  }
  return (
    <RoadmapBoard
      workspace={ws}
      roadmap={roadmap.data}
      isTeam={isTeam}
      signedIn={Boolean(me.data?.user)}
    />
  );
}
