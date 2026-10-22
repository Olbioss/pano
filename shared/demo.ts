/** The sandbox workspace that "Try as team" and "Try as member" open. */
export const DEMO_WORKSPACE_SLUG = "demo";

/**
 * Every demo account's address ends here: the seeded people and each
 * visitor's guest account. `.invalid` is reserved and never resolves, so no
 * email can reach these addresses.
 */
export const DEMO_EMAIL_DOMAIN = "demo.pano.invalid";

export function isDemoEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

/** Who a visitor tries the demo as: on the workspace's team, or not. */
export const DEMO_ROLES = ["team", "member"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];
