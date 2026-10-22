import { describe, expect, it } from "vitest";
import { DEMO_EMAIL_DOMAIN, isDemoEmail } from "./demo";

describe("isDemoEmail", () => {
  it("knows a demo address, whatever its case", () => {
    expect(isDemoEmail(`guest-1@${DEMO_EMAIL_DOMAIN}`)).toBe(true);
    expect(isDemoEmail("Defne@Demo.Pano.Invalid")).toBe(true);
  });

  it("leaves every other address alone", () => {
    expect(isDemoEmail("ayse@example.com")).toBe(false);
    // The whole domain, not a domain that merely ends the same way.
    expect(isDemoEmail("someone@notdemo.pano.invalid")).toBe(false);
  });
});
