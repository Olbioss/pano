import { passkey } from "@better-auth/passkey";
import type { Bindings } from "../env";

/**
 * Passkeys, through Better Auth's plugin. Its WebAuthn libraries make the
 * Worker about 650 KB bigger and its startup about 8 ms longer (measured
 * 2026-11-09), so withAuth imports this file only for /api/auth/passkey/*:
 * every other request starts without it.
 */
export function passkeyPlugin(env: Pick<Bindings, "BETTER_AUTH_URL">) {
  return passkey({
    // A passkey belongs to Pano's host: pano.olbios88.workers.dev in
    // production, localhost in development.
    rpID: new URL(env.BETTER_AUTH_URL).hostname,
    rpName: "Pano",
    origin: env.BETTER_AUTH_URL,
    // Discoverable, so a passkey signs in without typing an email.
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
  });
}
