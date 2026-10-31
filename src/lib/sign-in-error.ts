/**
 * The `signin.*` message for a code that wasn't sent. Better Auth's client
 * puts the response's JSON on its error, so Pano's own limits arrive with
 * their code; its per-IP limit answers 429 without one.
 */
export function codeErrorKey(failure: { status: number; code?: unknown }) {
  if (failure.code === "CODE_LIMIT") return "codeLimit";
  if (failure.code === "EMAIL_BUDGET") return "emailBudget";
  return failure.status === 429 ? "tooManyCodes" : "sendFailed";
}
