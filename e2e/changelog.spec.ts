import { expect, test } from "@playwright/test";
import {
  deleteRequest,
  postRequest,
  tryDemo,
  unique,
  untilSaved,
} from "./helpers";

test("the team ships a request with a note, and it heads the changelog", async ({
  browser,
}) => {
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await tryDemo(member, "member");
  const title = unique("Shipped by the end-to-end suite");
  const path = await postRequest(member, title);

  const teamContext = await browser.newContext();
  const team = await teamContext.newPage();
  await tryDemo(team, "team");
  await team.goto(path);
  await team.getByLabel("Status", { exact: true }).selectOption("shipped");
  await team
    .getByLabel("Note for the timeline (optional)")
    .fill("Out today, from the suite.");
  await untilSaved(team, "PATCH", "/status", () =>
    team.getByRole("button", { name: "Update status" }).click()
  );

  await team.goto("/demo/changelog");
  const newest = team.getByRole("listitem").first();
  await expect(newest.getByRole("link", { name: title })).toBeVisible();
  await expect(newest.getByText("Out today, from the suite.")).toBeVisible();

  // In the demo, a request is its author's to delete.
  await member.goto(path);
  await deleteRequest(member);
  await memberContext.close();
  await teamContext.close();
});
