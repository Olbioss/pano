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

/**
 * Where the email step goes when a code wasn't sent. Pano's per-address
 * limit means three codes went out already and the last one still works,
 * so the code step opens with a note; anything else stays, with the reason.
 */
export function afterRefusedCode(failure: { status: number; code?: unknown }) {
  return failure.code === "CODE_LIMIT"
    ? ({ step: "code", note: "useLatestCode" } as const)
    : ({ step: "email", error: codeErrorKey(failure) } as const);
}
