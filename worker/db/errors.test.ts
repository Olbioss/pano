import { describe, expect, it } from "vitest";
import { pgConstraint, pgErrorCode } from "./errors";

describe("pgErrorCode", () => {
  it("reads the code from the error itself", () => {
    expect(pgErrorCode({ code: "23505" })).toBe("23505");
  });

  it("finds it further down the cause chain", () => {
    const wrapped = new Error("insert failed", {
      cause: new Error("query failed", { cause: { code: "23505" } }),
    });
    expect(pgErrorCode(wrapped)).toBe("23505");
  });

  it("ignores codes that aren't Postgres codes", () => {
    expect(
      pgErrorCode({ code: "ORGANIZATION_ALREADY_EXISTS" })
    ).toBeUndefined();
  });

  it("returns undefined for things that aren't errors", () => {
    expect(pgErrorCode("boom")).toBeUndefined();
    expect(pgErrorCode(null)).toBeUndefined();
  });
});

describe("pgConstraint", () => {
  it("finds the constraint's name down the cause chain", () => {
    const wrapped = new Error("insert failed", {
      cause: {
        code: "23505",
        constraint_name: "member_one_owned_workspace_idx",
      },
    });
    expect(pgConstraint(wrapped)).toBe("member_one_owned_workspace_idx");
  });

  it("returns undefined when there's none", () => {
    expect(pgConstraint(new Error("boom"))).toBeUndefined();
    expect(pgConstraint(undefined)).toBeUndefined();
  });
});
