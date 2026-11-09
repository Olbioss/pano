import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";

/**
 * Better Auth's own routes (codes, passwords, passkeys, GitHub, sign out).
 * They answer in Better Auth's JSON, so they go through this client, not
 * `unwrap`.
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [emailOTPClient(), passkeyClient()],
});
