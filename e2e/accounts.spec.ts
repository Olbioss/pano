import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";

/**
 * Password accounts and passkeys, end to end. Codes are stored hashed and
 * only logged in development, so these tests confirm the address in the
 * database; the code screens have their own component and API tests. They
 * make real accounts, so they run locally and in CI, never on the live site.
 */
test.skip(
  Boolean(process.env.E2E_BASE_URL),
  "makes accounts: local and CI only"
);

const PASSWORD = "correct horse battery";
const newEmail = () => `e2e-${Date.now().toString(36)}@example.com`;

/** What entering the emailed code does, without the email. */
async function confirmAddress(email: string) {
  const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
  try {
    await sql`update "user" set email_verified = true where email = ${email}`;
  } finally {
    await sql.end();
  }
}

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(`We sent a code to ${email}`)).toBeVisible();
  await confirmAddress(email);
}

async function signInWithPassword(page: Page, email: string) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/new-workspace$/);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true })
  ).toBeVisible();
}

test("signs up with a password, then signs in with it", async ({ page }) => {
  const email = newEmail();
  await signUp(page, email);
  await signInWithPassword(page, email);
  await signOut(page);
  await signInWithPassword(page, email);
});

test("adds a passkey on the account page, then signs in with it", async ({
  page,
}) => {
  // Chrome's built-in test device stands in for a phone or a laptop.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  const email = newEmail();
  await signUp(page, email);
  await signInWithPassword(page, email);

  await page.goto("/account");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByText(/^Added /)).toBeVisible();

  await signOut(page);
  await page.goto("/signin");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).toHaveURL(/\/new-workspace$/);
});
