import { describe, expect, it } from "vitest";
import app from "./app";
import { testEnv } from "./test/env";

describe("the API app", () => {
  it("answers an unknown /api path with a JSON 404 envelope", async () => {
    const { env, ctx, settle } = testEnv();
    const res = await app.request("/api/does-not-exist", {}, env, ctx);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      success: false,
      code: "NOT_FOUND",
      error: "Not found",
    });
    await settle();
  });
});
