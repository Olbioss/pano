import { describe, expect, it } from "vitest";
import { afterRefusedCode, codeErrorKey } from "./sign-in-error";

describe("codeErrorKey", () => {
  it("names Pano's own limits", () => {
    expect(codeErrorKey({ status: 429, code: "CODE_LIMIT" })).toBe("codeLimit");
    expect(codeErrorKey({ status: 429, code: "EMAIL_BUDGET" })).toBe(
      "emailBudget"
    );
  });

  it("falls back to the per-IP limit and to a failed send", () => {
    expect(codeErrorKey({ status: 429 })).toBe("tooManyCodes");
    expect(codeErrorKey({ status: 502, code: "INTERNAL_ERROR" })).toBe(
      "sendFailed"
    );
  });
});

describe("afterRefusedCode", () => {
  it("asks for the latest code once an address has had its three", () => {
    expect(afterRefusedCode({ status: 429, code: "CODE_LIMIT" })).toEqual({
      step: "code",
      note: "useLatestCode",
    });
  });

  it("stays on the email step with the reason otherwise", () => {
    expect(afterRefusedCode({ status: 429, code: "EMAIL_BUDGET" })).toEqual({
      step: "email",
      error: "emailBudget",
    });
    expect(afterRefusedCode({ status: 429 })).toEqual({
      step: "email",
      error: "tooManyCodes",
    });
  });
});
