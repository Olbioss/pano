import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { Route as NewWorkspaceRoute } from "@/routes/new-workspace";
import { meQueryOptions, ownedWorkspace } from "./session";

const workspace = (slug: string, role: string) => ({
  id: `id-${slug}`,
  slug,
  name: slug,
  role,
});

describe("ownedWorkspace", () => {
  it("counts only the workspace an account owns", () => {
    expect(ownedWorkspace([workspace("acme", "member")])).toBeUndefined();
    expect(
      ownedWorkspace([workspace("acme", "admin"), workspace("own", "owner")])
    ).toMatchObject({ slug: "own" });
  });
});

describe("/new-workspace", () => {
  /** Opens the page as Sam, on the given teams. */
  function visit(workspaces: ReturnType<typeof workspace>[]) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(meQueryOptions.queryKey, {
      user: { id: "u-sam", name: "Sam", email: "sam@studio.dev" },
      workspaces,
    });
    return NewWorkspaceRoute.options.beforeLoad?.({
      context: { queryClient },
      location: { href: "/new-workspace" },
    } as never);
  }

  it("lets someone on another team make their own workspace (#8)", async () => {
    await expect(visit([workspace("acme", "member")])).resolves.toBeUndefined();
  });

  it("sends an owner to the workspace they own", async () => {
    await expect(
      visit([workspace("acme", "admin"), workspace("own", "owner")])
    ).rejects.toMatchObject({ options: { to: "/$ws", params: { ws: "own" } } });
  });
});
