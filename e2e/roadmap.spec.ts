import { expect, test } from "@playwright/test";
import { deleteRequest, postRequest, tryDemo, unique } from "./helpers";

test("the team drags a card to Planned, and a member sees the new status", async ({
  browser,
}) => {
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await tryDemo(member, "member");
  const title = unique("Card for the roadmap test");
  const path = await postRequest(member, title);

  const teamContext = await browser.newContext();
  const team = await teamContext.newPage();
  await tryDemo(team, "team");

  // Onto the roadmap first: In progress, from the request's page.
  await team.goto(path);
  await team.getByLabel("Status", { exact: true }).selectOption("in_progress");
  await team.getByRole("button", { name: "Update status" }).click();
  await expect(
    team.getByRole("article").getByText("In progress", { exact: true })
  ).toBeVisible();

  // Then dragged by its handle into Planned.
  await team.goto("/demo/roadmap");
  const planned = team.locator('[data-roadmap-column="planned"]');
  await team.getByRole("button", { name: `Move “${title}”` }).hover();
  await team.mouse.down();
  const target = await planned.boundingBox();
  if (!target) throw new Error("the Planned column isn't on screen");
  await team.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 15 }
  );
  await team.mouse.up();
  await expect(planned.getByRole("link", { name: title })).toBeVisible();

  // The member, in another browser, sees it planned.
  await member.reload();
  await expect(
    member.getByRole("article").getByText("Planned", { exact: true })
  ).toBeVisible();

  // In the demo, a request is its author's to delete.
  await deleteRequest(member);
  await memberContext.close();
  await teamContext.close();
});
