import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { handleError } from "./errors";
import { validate } from "./validate";

const thing = z.object({
  name: z.string().min(2),
  tags: z.array(z.string()).max(1),
});
const app = new Hono().post("/things", validate("json", thing), (c) =>
  c.json({ ok: true, name: c.req.valid("json").name })
);
app.onError(handleError);

const post = (body: string) =>
  app.request("/things", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

describe("validate", () => {
  it("passes valid input to the handler", async () => {
    const res = await post(JSON.stringify({ name: "ok", tags: [] }));
    expect(await res.json()).toEqual({ ok: true, name: "ok" });
  });

  it("answers invalid input with one message per field", async () => {
    const res = await post(JSON.stringify({ name: "x", tags: ["a", "b"] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
      error: "Invalid input",
      fields: { name: expect.any(String), tags: expect.any(String) },
    });
  });

  it("answers malformed JSON with the envelope too", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
  });
});
