import { expect, test } from "@playwright/test";
import { tryDemo } from "./helpers";

test("a demo guest finds Pano's own board closed to them, and why", async ({
  page,
}) => {
  await tryDemo(page, "member");
  await page.goto("/pano");
  await expect(
    page.getByText("Guest accounts only work in the demo.")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New request" })
  ).toBeDisabled();
});
