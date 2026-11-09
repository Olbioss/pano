/**
 * Adding a way to sign in (a password, a passkey, GitHub) needs a session
 * started within this long, so a stolen session that has been around for
 * days can't add a way back in. Better Auth's own checks use the same age.
 */
export const FRESH_SESSION_SECONDS = 24 * 60 * 60;

/** Whether a session that started at `startedAt` may add a sign-in method. */
export function isSessionFresh(startedAt: string | Date, now = Date.now()) {
  return now - new Date(startedAt).getTime() < FRESH_SESSION_SECONDS * 1000;
}
