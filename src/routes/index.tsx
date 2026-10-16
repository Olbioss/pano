import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api, unwrap } from "@/lib/api";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => unwrap(await api.health.$get()),
    retry: 1,
  });
  if (health.isPending) return <main>Checking the API…</main>;
  if (health.isError) return <main>API unreachable</main>;
  // health.data.db is typed "up": the type comes from the Worker's route.
  return <main>API {health.data.db}</main>;
}
