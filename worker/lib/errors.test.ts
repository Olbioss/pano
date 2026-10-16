import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError, handleError, handleNotFound } from "./errors";

function appThatThrows(error: Error) {
  const app = new Hono().get("/boom", () => {
    throw error;
  });
  app.onError(handleError);
  app.notFound(handleNotFound);
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleError", () => {
  it("turns an AppError into its status, code, message and fields", async () => {
    const error = new AppError(409, "CONFLICT", "Slug taken", {
      slug: "Already used",
    });
    const res = await appThatThrows(error).request("/boom");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      code: "CONFLICT",
      error: "Slug taken",
      fields: { slug: "Already used" },
    });
  });

  it("leaves fields out when an AppError has none", async () => {
    const error = new AppError(403, "FORBIDDEN", "Team only");
    const res = await appThatThrows(error).request("/boom");
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body).toEqual({
      success: false,
      code: "FORBIDDEN",
      error: "Team only",
    });
    expect(body).not.toHaveProperty("fields");
  });

  it("maps an HTTPException's status to a code", async () => {
    const error = new HTTPException(401, { message: "Sign in first" });
    const res = await appThatThrows(error).request("/boom");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      code: "UNAUTHORIZED",
      error: "Sign in first",
    });
  });

  it("falls back to INTERNAL_ERROR for a status without a code", async () => {
    const error = new HTTPException(418, { message: "Teapot" });
    const res = await appThatThrows(error).request("/boom");
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("hides an unexpected error's details behind a generic 500", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("connect failed: password=hunter2");
    const res = await appThatThrows(error).request("/boom");
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(body)).toEqual({
      success: false,
      code: "INTERNAL_ERROR",
      error: "Internal Server Error",
    });
    expect(body).not.toContain("hunter2");
    expect(log).toHaveBeenCalledOnce();
  });
});

describe("handleNotFound", () => {
  it("answers 404 with the error envelope", async () => {
    const res = await appThatThrows(new Error("unused")).request("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      code: "NOT_FOUND",
      error: "Not found",
    });
  });
});
