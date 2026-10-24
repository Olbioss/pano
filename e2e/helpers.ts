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

/**
 * Does `action`, then waits for the API to answer the save it starts: a
 * `method` request to a path ending in `pathEnd`. Changes show at once and
 * save behind them, and a page load cancels a save still on its way, which
 * on the live site takes a few hundred milliseconds. So a test waits for
 * this before it leaves the page or looks from another browser.
 */
export async function untilSaved(
  page: Page,
  method: "POST" | "PUT" | "PATCH",
  pathEnd: string,
  action: () => Promise<unknown>
) {
  const answer = page.waitForResponse(
    (res) =>
      res.request().method() === method &&
      new URL(res.url()).pathname.endsWith(pathEnd)
  );
  await action();
  expect((await answer).ok(), `${method} ${pathEnd} saved`).toBe(true);
}

/** Deletes the request open on the page. In the demo, only its author can. */
export async function deleteRequest(page: Page) {
  const article = page.getByRole("article");
  await article.getByRole("button", { name: "Delete" }).click();
  await article.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page).toHaveURL(/\/demo$/);
}
