import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import { type ZodType, z } from "zod";
import type { ErrorResponse } from "@/shared/envelope";

/**
 * @hono/zod-validator, answering bad input with the error envelope: one
 * message per field (the first issue wins), keyed by its dotted path, with
 * form-level problems under "_". Where the schema sets a field-error key,
 * that key is the message.
 */
export const validate = <
  Target extends keyof ValidationTargets,
  Schema extends ZodType,
>(
  target: Target,
  schema: Schema
) =>
  zValidator(target, schema, (result, c) => {
    if (result.success) return;
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.map(String).join(".") || "_";
      fields[path] ??= issue.message;
    }
    return c.json<ErrorResponse>(
      { success: false, code: "BAD_REQUEST", error: "Invalid input", fields },
      400
    );
  });

/** A numeric `:id` in the path, as a safe positive integer. */
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
