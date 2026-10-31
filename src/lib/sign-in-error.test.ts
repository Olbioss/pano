import { describe, expect, it } from "vitest";
import { codeErrorKey } from "./sign-in-error";

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
