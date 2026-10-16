import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { apiErrorKey, fieldErrorKey } from "./error-text";

describe("apiErrorKey", () => {
  it("uses the API's code", () => {
    const error = new ApiError(409, "WORKSPACE_LIMIT", "One per account");
    expect(apiErrorKey(error)).toBe("WORKSPACE_LIMIT");
  });

  it("treats anything else as a network problem", () => {
    expect(apiErrorKey(new TypeError("Failed to fetch"))).toBe("NETWORK");
  });
});

describe("fieldErrorKey", () => {
  it("recognises our keys", () => {
    expect(fieldErrorKey("SLUG_TAKEN")).toBe("SLUG_TAKEN");
  });

  it("leaves zod's already-translated messages alone", () => {
    expect(fieldErrorKey("En az 2 karakter olmalı")).toBeNull();
  });
});
