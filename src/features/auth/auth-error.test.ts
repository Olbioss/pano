import { describe, expect, it } from "vitest";
import { authErrorKey, githubErrorKey, passkeyCancelled } from "./auth-error";

describe("authErrorKey", () => {
  it.each([
    ["INVALID_EMAIL_OR_PASSWORD", "wrongPassword"],
    ["EMAIL_NOT_VERIFIED", "notConfirmed"],
    ["PASSWORD_PAUSED", "passwordPaused"],
    ["PASSWORD_TOO_SHORT", "passwordLength"],
    ["PASSWORD_COMPROMISED", "passwordCompromised"],
    ["INVALID_OTP", "codeInvalid"],
    ["CODE_LIMIT", "codeLimit"],
    ["EMAIL_BUDGET", "emailBudget"],
    ["DEMO_ONLY", "demoOnly"],
    ["SESSION_NOT_FRESH", "signInAgain"],
    ["PASSKEY_LIMIT", "passkeyLimit"],
    ["ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", "passkeyNotCreated"],
    ["UNKNOWN_ERROR", "passkeyNotCreated"],
    ["PASSWORD_EXISTS", "passwordExists"],
    ["INVALID_PASSWORD", "currentPasswordWrong"],
  ])("names %s", (code, key) => {
    expect(authErrorKey({ status: 400, code })).toBe(key);
  });

  it("falls back to the per-IP limit, then to a general message", () => {
    expect(authErrorKey({ status: 429 })).toBe("tooManyAttempts");
    expect(authErrorKey({ status: 500, code: "SOMETHING_NEW" })).toBe(
      "somethingWrong"
    );
  });
});

describe("passkeyCancelled", () => {
  it("treats a closed passkey prompt as no error", () => {
    expect(passkeyCancelled({ code: "AUTH_CANCELLED" })).toBe(true);
    expect(passkeyCancelled({ code: "PASSKEY_LIMIT" })).toBe(false);
  });
});

describe("githubErrorKey", () => {
  it("explains why GitHub sign-in came back refused", () => {
    expect(githubErrorKey("account_not_linked")).toBe("githubNotLinked");
    expect(githubErrorKey("github_email_unverified")).toBe("githubUnverified");
    expect(githubErrorKey("state_mismatch")).toBe("githubFailed");
  });
});
