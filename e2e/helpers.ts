import { expect, type Page } from "@playwright/test";

/** A title no other run uses, so tests find their own requests. */
export const unique = (title: string) => `${title} ${Date.now().toString(36)}`;

/** Takes a landing page button into the demo, as a new guest. */
export async function tryDemo(page: Page, as: "team" | "member") {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: as === "team" ? "Try as team" : "Try as member",
    })
    .click();
  await expect(page).toHaveURL(as === "team" ? /\/demo\/roadmap$/ : /\/demo$/);
  await expect(page.getByText(/^Guest \d{4}$/)).toBeVisible();
}

/** Posts a request in the demo and answers its address. */
export async function postRequest(page: Page, title: string, body = "") {
  await page.goto("/demo/new");
  await page.getByLabel("Title").fill(title);
  if (body) await page.getByLabel("Details (optional)").fill(body);
  await page.getByRole("button", { name: "Post request" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: title })
  ).toBeVisible();
  return new URL(page.url()).pathname;
}

/** Deletes the request open on the page: its author or the team can. */
export async function deleteRequest(page: Page) {
  const article = page.getByRole("article");
  await article.getByRole("button", { name: "Delete" }).click();
  await article.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page).toHaveURL(/\/demo$/);
}
