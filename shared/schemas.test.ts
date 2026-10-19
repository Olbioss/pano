import { describe, expect, it } from "vitest";
import {
  boardNameSchema,
  changeStatusSchema,
  codeFormSchema,
  commentBodySchema,
  commentPageQuerySchema,
  createCommentSchema,
  createPostSchema,
  createWorkspaceSchema,
  displayNameSchema,
  feedQuerySchema,
  mergeSchema,
  pinSchema,
  similarQuerySchema,
  subscriptionSchema,
  updatePostSchema,
  updateWorkspaceSchema,
  voteSchema,
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

describe("displayNameSchema", () => {
  it.each(["Al", "Ayşe Yılmaz"])("accepts %s", (name) => {
    expect(displayNameSchema.safeParse(name).success).toBe(true);
  });

  it("refuses a name with fewer than two letters or digits", () => {
    expect(messages(displayNameSchema.safeParse("!!"))).toEqual([
      "NAME_NEEDS_LETTERS",
    ]);
  });

  it("refuses a name over 50 characters", () => {
    expect(displayNameSchema.safeParse("a".repeat(51)).success).toBe(false);
  });
});

const BOARD = "0b3f5c1e-8f5a-4c3e-9a51-2b7d0c9e4f11";

describe("createPostSchema", () => {
  it("accepts a post with an empty body", () => {
    const input = { boardId: BOARD, title: "Dark mode", body: "" };
    expect(createPostSchema.safeParse(input).success).toBe(true);
  });

  it("refuses a title under 3 characters", () => {
    const input = { boardId: BOARD, title: " ab ", body: "" };
    expect(createPostSchema.safeParse(input).success).toBe(false);
  });

  it("refuses a body over 5000 characters", () => {
    const input = {
      boardId: BOARD,
      title: "Dark mode",
      body: "x".repeat(5001),
    };
    expect(createPostSchema.safeParse(input).success).toBe(false);
  });
});

describe("updatePostSchema", () => {
  it("needs at least one change", () => {
    expect(messages(updatePostSchema.safeParse({}))).toEqual([
      "NOTHING_TO_UPDATE",
    ]);
  });
});

describe("feedQuerySchema", () => {
  it("fills in the defaults", () => {
    expect(feedQuerySchema.parse({})).toEqual({
      sort: "trending",
      page: 1,
      limit: 20,
    });
  });

  it.each([{ page: "0" }, { limit: "51" }, { sort: "hot" }])(
    "refuses %j",
    (query) => {
      expect(feedQuerySchema.safeParse(query).success).toBe(false);
    }
  );
});

describe("similarQuerySchema", () => {
  it("refuses a one-letter query", () => {
    expect(similarQuerySchema.safeParse({ q: "a" }).success).toBe(false);
  });
});

describe("voteSchema", () => {
  it("takes only true or false", () => {
    expect(voteSchema.safeParse({ voted: "yes" }).success).toBe(false);
  });
});

describe("commentBodySchema", () => {
  it("trims a comment", () => {
    expect(commentBodySchema.parse("  Same here.  ")).toBe("Same here.");
  });

  it.each([
    ["an empty comment", ""],
    ["a comment of spaces", "   \n "],
    ["a comment over 3000 characters", "x".repeat(3001)],
    ["a comment with a NUL character", "a\u0000b"],
  ])("refuses %s", (_label, body) => {
    expect(commentBodySchema.safeParse(body).success).toBe(false);
  });
});

describe("createCommentSchema", () => {
  it("takes a reply's parent as a positive id", () => {
    const reply = { body: "Yes", parentId: 4 };
    expect(createCommentSchema.safeParse(reply).success).toBe(true);
    const bad = { body: "Yes", parentId: 0 };
    expect(createCommentSchema.safeParse(bad).success).toBe(false);
  });
});

describe("commentPageQuerySchema", () => {
  it("fills in the page size", () => {
    expect(commentPageQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it.each([
    { before: "abc" },
    { before: "0" },
    { limit: "0" },
    { limit: "51" },
  ])("refuses %j", (query) => {
    expect(commentPageQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("pinSchema", () => {
  it("takes a comment id, or null to unpin", () => {
    expect(pinSchema.safeParse({ commentId: 3 }).success).toBe(true);
    expect(pinSchema.safeParse({ commentId: null }).success).toBe(true);
    expect(pinSchema.safeParse({}).success).toBe(false);
  });
});

describe("changeStatusSchema", () => {
  it("takes a status, with or without a note, trimmed", () => {
    expect(
      changeStatusSchema.parse({ status: "planned", note: "  Next month.  " })
    ).toEqual({ status: "planned", note: "Next month." });
    expect(changeStatusSchema.parse({ status: "shipped" })).toEqual({
      status: "shipped",
    });
  });

  it.each([
    ["an unknown status", { status: "done" }],
    [
      "a note over 1000 characters",
      { status: "planned", note: "x".repeat(1001) },
    ],
    ["a note with a NUL character", { status: "planned", note: "a\u0000b" }],
  ])("refuses %s", (_label, input) => {
    expect(changeStatusSchema.safeParse(input).success).toBe(false);
  });
});

describe("mergeSchema", () => {
  it("takes the target as a positive id", () => {
    expect(mergeSchema.safeParse({ intoId: 4 }).success).toBe(true);
    expect(mergeSchema.safeParse({ intoId: 0 }).success).toBe(false);
  });
});

describe("subscriptionSchema", () => {
  it("takes only true or false", () => {
    expect(subscriptionSchema.safeParse({ subscribed: "yes" }).success).toBe(
      false
    );
  });
});
