import { expect, test } from "@playwright/test";
import {
  deleteRequest,
  postRequest,
  tryDemo,
  unique,
  untilSaved,
} from "./helpers";

test("a member submits a request, sees similar ones, votes and comments", async ({
  page,
}) => {
  await tryDemo(page, "member");

  const title = unique("Export to Markdown, from the end-to-end suite");
  const path = await postRequest(
    page,
    title,
    "Posted by the end-to-end suite."
  );
  // The author's own vote comes with the request.
  const article = page.getByRole("article");
  await expect(
    article.getByRole("button", { name: `Vote for ${title}` })
  ).toHaveText("1");

  await page.getByLabel("Add a comment").fill("A comment from the suite.");
  await untilSaved(page, "POST", "/comments", () =>
    page.getByRole("button", { name: "Comment", exact: true }).click()
  );
  await expect(page.getByRole("heading", { name: "1 comment" })).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Comments" })
      .getByText("A comment from the suite.")
  ).toBeVisible();

  // Typing a title like it brings the request up, votable from the form.
  // It's the run's own request: the demo's requests are the team's to ship,
  // merge and move, so a live run can't count on any one of them.
  await page.goto("/demo/new");
  await page.getByLabel("Title").fill("Export to Markdown from the suite");
  const vote = page
    .getByRole("complementary", { name: "Similar requests" })
    .getByRole("button", { name: `Vote for ${title}` });
  await expect(vote).toHaveText("1");
  await untilSaved(page, "PUT", "/vote", () => vote.click());
  await expect(vote).toHaveText("0");
  await expect(vote).toHaveAttribute("aria-pressed", "false");
  await untilSaved(page, "PUT", "/vote", () => vote.click());
  await expect(vote).toHaveText("1");

  await page.goto(path);
  await deleteRequest(page);
});
