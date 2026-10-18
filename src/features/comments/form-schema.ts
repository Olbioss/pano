import { z } from "zod";
import { commentBodySchema, displayNameSchema } from "@/shared/schemas";

/** The comment box. The name is asked for only while the person has none. */
export function commentFormSchema(needsName: boolean) {
  return z.object({
    name: needsName ? displayNameSchema : z.string(),
    body: commentBodySchema,
  });
}
