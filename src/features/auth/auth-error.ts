/** A `signin.*` message for a refusal from Better Auth or Pano. */
export type AuthErrorKey =
  | "wrongPassword"
  | "notConfirmed"
  | "passwordPaused"
  | "passwordLength"
  | "passwordCompromised"
  | "codeInvalid"
  | "codeLimit"
  | "emailBudget"
  | "tooManyAttempts"
  | "sendFailed"
  | "demoOnly"
  | "signInAgain"
  | "passkeyLimit"
  | "passwordExists"
  | "currentPasswordWrong"
  | "passkeyFailed"
  | "somethingWrong";

/**
 * Better Auth's client puts the response's JSON on its error, so both its
 * own codes and Pano's arrive in `code`. Better Auth's English messages are
 * never shown.
 */
export function authErrorKey(failure: {
  status?: number;
  code?: unknown;
}): AuthErrorKey {
  switch (failure.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "wrongPassword";
    case "EMAIL_NOT_VERIFIED":
      return "notConfirmed";
    case "PASSWORD_PAUSED":
      return "passwordPaused";
    case "PASSWORD_TOO_SHORT":
    case "PASSWORD_TOO_LONG":
      return "passwordLength";
    case "PASSWORD_COMPROMISED":
      return "passwordCompromised";
    case "INVALID_OTP":
    case "OTP_EXPIRED":
    case "TOO_MANY_ATTEMPTS":
      return "codeInvalid";
    case "CODE_LIMIT":
      return "codeLimit";
    case "EMAIL_BUDGET":
      return "emailBudget";
    case "INTERNAL_ERROR":
      return "sendFailed";
    case "DEMO_ONLY":
      return "demoOnly";
    case "SESSION_NOT_FRESH":
      return "signInAgain";
    case "PASSKEY_LIMIT":
      return "passkeyLimit";
    case "PASSWORD_EXISTS":
    case "PASSWORD_ALREADY_SET":
      return "passwordExists";
    case "INVALID_PASSWORD":
      return "currentPasswordWrong";
  }
  return failure.status === 429 ? "tooManyAttempts" : "somethingWrong";
}

/** A passkey prompt the person closed is no error worth showing. */
export function passkeyCancelled(failure: object) {
  const code = "code" in failure ? failure.code : undefined;
  return code === "AUTH_CANCELLED" || code === "ERROR_CEREMONY_ABORTED";
}

/** A `signin.*` message for the `?error=` GitHub sign-in came back with. */
export function githubErrorKey(error: string) {
  if (error === "account_not_linked") return "githubNotLinked" as const;
  if (error === "github_email_unverified") return "githubUnverified" as const;
  return "githubFailed" as const;
}
