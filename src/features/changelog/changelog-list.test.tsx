// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, within } from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { afterEach, describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";
import type { ChangelogEntry } from "@/shared/changelog";
import { ChangelogList } from "./changelog-list";

afterEach(cleanup);

const entry = (
  id: number,
  title: string,
  shippedAt: string,
  note: string | null = null,
  voteCount = 1
): ChangelogEntry => ({
  id,
  ref: `${id}-${title.toLowerCase().replace(/ /g, "-")}`,
  title,
  voteCount,
  shippedAt,
  note,
});

/** In the router, for its links; it renders on the next tick. */
function renderList(entries: ChangelogEntry[]) {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <ChangelogList entries={entries} />,
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <RouterProvider router={router} />
    </IntlProvider>
  );
}

describe("ChangelogList", () => {
  it("groups shipped requests by month, newest first", async () => {
    renderList([
      entry(3, "Dark mode", "2026-10-21T09:00:00Z", "Shipped in 2.6.", 31),
      entry(2, "Daily notes", "2026-10-02T09:00:00Z"),
      entry(1, "Import from Notion", "2026-09-14T09:00:00Z", null, 18),
    ]);
    await screen.findByRole("heading", { name: "October 2026" });
    const months = screen.getAllByRole("heading", { level: 2 });
    expect(months.map((month) => month.textContent)).toEqual([
      "October 2026",
      "September 2026",
    ]);
    const october = within(
      screen.getByRole("region", { name: "October 2026" })
    );
    expect(
      october.getAllByRole("link").map((link) => link.getAttribute("href"))
    ).toEqual(["/p/3-dark-mode", "/p/2-daily-notes"]);
    expect(october.getByText("31 votes")).toBeTruthy();
    expect(october.getByText("1 vote")).toBeTruthy();
    expect(october.getByText("Shipped October 21")).toBeTruthy();
    expect(october.getByText("Shipped in 2.6.")).toBeTruthy();
  });

  it("says when nothing has shipped", async () => {
    renderList([]);
    expect(await screen.findByText("Nothing has shipped yet.")).toBeTruthy();
  });
});
