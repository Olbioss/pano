import { describe, expect, it } from "vitest";
import { isRoadmapStatus, POST_STATUSES } from "./status";

describe("isRoadmapStatus", () => {
  it("is true for the roadmap's three columns only", () => {
    expect(POST_STATUSES.filter(isRoadmapStatus)).toEqual([
      "planned",
      "in_progress",
      "shipped",
    ]);
  });
});
