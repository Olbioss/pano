import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";

/**
 * Better Auth's own routes (send code, sign in, sign out). They answer in
 * Better Auth's JSON, so they go through this client, not `unwrap`.
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [emailOTPClient()],
});
