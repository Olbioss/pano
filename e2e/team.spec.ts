import { expect, test } from "@playwright/test";
import { tryDemo } from "./helpers";

test("the demo's Team page lists Inkwell's team, read-only", async ({
  page,
}) => {
  await tryDemo(page, "team");
  await page.goto("/demo/settings");
  const members = page.getByRole("region", { name: "Members" });
  await expect(members.getByText("Defne Aksoy")).toBeVisible();
  await expect(members.getByText("Owner", { exact: true })).toBeVisible();
  await expect(members.getByText(/^Guest \d{4} \(you\)$/)).toBeVisible();
  // A team guest is a member: no invitations, and the demo stays as it is.
  await expect(page.getByLabel("Email")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Leave team" })).toBeDisabled();
});
