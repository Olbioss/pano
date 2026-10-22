import { expect, test } from "@playwright/test";
import { deleteRequest, postRequest, tryDemo, unique } from "./helpers";

test("a member submits a request, sees similar ones, votes and comments", async ({
  page,
}) => {
  await tryDemo(page, "member");

  // Typing a title brings up the requests it may duplicate, each votable.
  await page.goto("/demo/new");
  await page.getByLabel("Title").fill("Dark theme for the editor");
  const similar = page.getByRole("complementary", {
    name: "Similar requests",
  });
  const vote = similar.getByRole("button", { name: "Vote for Dark mode" });
  const before = Number(await vote.textContent());
  await vote.click();
  await expect(vote).toHaveText(String(before + 1));
  await expect(vote).toHaveAttribute("aria-pressed", "true");
  // Taken back, so the demo is left as it was.
  await vote.click();
  await expect(vote).toHaveText(String(before));

  const title = unique("Export to Markdown, from the end-to-end suite");
  await postRequest(page, title, "Posted by the end-to-end suite.");
  // The author's own vote comes with the request.
  const article = page.getByRole("article");
  await expect(
    article.getByRole("button", { name: `Vote for ${title}` })
  ).toHaveText("1");

  await page.getByLabel("Add a comment").fill("A comment from the suite.");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByRole("heading", { name: "1 comment" })).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Comments" })
      .getByText("A comment from the suite.")
  ).toBeVisible();

  await deleteRequest(page);
});
