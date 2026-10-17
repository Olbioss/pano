import { describe, expect, it } from "vitest";
import { submitFormSchema } from "./form-schema";

const BOARD = "0b3f5c1e-8f5a-4c3e-9a51-2b7d0c9e4f11";
const values = (overrides: Partial<Record<string, string>> = {}) => ({
  name: "",
  boardId: BOARD,
  title: "Dark mode",
  body: "",
  ...overrides,
});

describe("submitFormSchema", () => {
  it("asks for a name while the person has none", () => {
    expect(submitFormSchema(true).safeParse(values()).success).toBe(false);
  });

  it("ignores the name field otherwise", () => {
    expect(submitFormSchema(false).safeParse(values()).success).toBe(true);
  });

  it("refuses a title under 3 characters", () => {
    const parsed = submitFormSchema(false).safeParse(values({ title: "ab" }));
    expect(parsed.success).toBe(false);
  });
});
