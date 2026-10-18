import { describe, expect, it } from "vitest";
import { commentFormSchema } from "./form-schema";

describe("commentFormSchema", () => {
  it("needs a name only while the person has none", () => {
    const unnamed = { name: "", body: "Hi" };
    expect(commentFormSchema(false).safeParse(unnamed).success).toBe(true);
    expect(commentFormSchema(true).safeParse(unnamed).success).toBe(false);
  });

  it("refuses a blank comment", () => {
    const blank = { name: "", body: "   " };
    expect(commentFormSchema(false).safeParse(blank).success).toBe(false);
  });
});
