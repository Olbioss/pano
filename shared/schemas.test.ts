import { describe, expect, it } from "vitest";
import {
  boardNameSchema,
  codeFormSchema,
  createWorkspaceSchema,
  updateWorkspaceSchema,
  workspaceSlugSchema,
} from "./schemas";

type Parsed = {
  success: boolean;
  error?: { issues: { message: string }[] };
};
const messages = (result: Parsed) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe("workspaceSlugSchema", () => {
  it("accepts a plain slug", () => {
    expect(workspaceSlugSchema.safeParse("acme-corp").success).toBe(true);
  });

  it.each(["Acme", "acme_corp", "-acme", "acme--corp", "acme-"])(
    "flags %s as badly formed",
    (slug) => {
      expect(messages(workspaceSlugSchema.safeParse(slug))).toContain(
        "SLUG_FORMAT"
      );
    }
  );

  it("flags a reserved slug", () => {
    expect(messages(workspaceSlugSchema.safeParse("settings"))).toEqual([
      "SLUG_RESERVED",
    ]);
  });
});

describe("createWorkspaceSchema", () => {
  it("accepts a Turkish workspace", () => {
    const input = { name: "Rezerve", slug: "rezerve", defaultLocale: "tr" };
    expect(createWorkspaceSchema.safeParse(input).success).toBe(true);
  });

  it("refuses an unsupported language", () => {
    const input = { name: "Rezerve", slug: "rezerve", defaultLocale: "de" };
    expect(createWorkspaceSchema.safeParse(input).success).toBe(false);
  });
});

describe("updateWorkspaceSchema", () => {
  it("needs at least one change", () => {
    expect(messages(updateWorkspaceSchema.safeParse({}))).toEqual([
      "NOTHING_TO_UPDATE",
    ]);
  });
});

describe("boardNameSchema", () => {
  it("accepts a Turkish name", () => {
    expect(boardNameSchema.safeParse("Özellik istekleri").success).toBe(true);
  });

  it("refuses a name with no letters or digits", () => {
    expect(messages(boardNameSchema.safeParse("!!!"))).toEqual([
      "NAME_NEEDS_LETTERS",
    ]);
  });
});

describe("codeFormSchema", () => {
  it.each(["12345", "1234567", "12a456"])("refuses %s", (code) => {
    expect(messages(codeFormSchema.safeParse({ code }))).toEqual([
      "CODE_FORMAT",
    ]);
  });

  it("accepts six digits", () => {
    expect(codeFormSchema.safeParse({ code: "048213" }).success).toBe(true);
  });
});
