import { describe, expect, it } from "vitest";
import { ApiError, unwrap } from "./api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("unwrap", () => {
  it("returns data from a success envelope", async () => {
    const res = json(200, { success: true, data: { db: "up" } });
    await expect(unwrap(res)).resolves.toEqual({ db: "up" });
  });

  it("throws ApiError with the envelope's status, code, message and fields", async () => {
    const res = json(409, {
      success: false,
      code: "CONFLICT",
      error: "Slug taken",
      fields: { slug: "Already used" },
    });
    const error = await unwrap(res).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "CONFLICT",
      message: "Slug taken",
      fields: { slug: "Already used" },
    });
  });

  it("throws INTERNAL_ERROR when an error body isn't JSON", async () => {
    const res = new Response("<html>502 Bad Gateway</html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    });
    const error = await unwrap(res).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: "INTERNAL_ERROR" });
  });

  it("throws INTERNAL_ERROR when JSON isn't the error envelope", async () => {
    const error = await unwrap(json(500, { message: "boom" })).catch(
      (e: unknown) => e
    );
    expect(error).toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
  });

  it("throws INTERNAL_ERROR when a successful response isn't JSON", async () => {
    const res = new Response("<html>Wi-Fi login</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    const error = await unwrap(res).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 200, code: "INTERNAL_ERROR" });
  });
});
