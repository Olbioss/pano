import { describe, expect, it } from "vitest";
import { maskEmail } from "./invitations";

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("sam@studio.dev")).toBe("s•••@studio.dev");
    expect(maskEmail("a@b.co")).toBe("a•••@b.co");
  });

  it("hides anything that isn't an address", () => {
    expect(maskEmail("not-an-address")).toBe("•••");
    expect(maskEmail("@studio.dev")).toBe("•••");
  });
});
